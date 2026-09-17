import logging
from collections.abc import Mapping, Sequence
from uuid import UUID, uuid4

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.common.exceptions import ProtectedResourceError, ResourceNotFound
from apps.history.models import TaskEvent
from apps.history.services import record_event
from apps.lists.models import List
from apps.lists.selectors import get_owned_list
from apps.lists.services.delete_list import delete_list
from apps.lists.services.update_list import update_list
from apps.sync.models import SyncOperation
from apps.tasks.models import Task
from apps.tasks.services.complete_task import complete_task
from apps.tasks.services.delete_task import delete_task
from apps.tasks.services.reopen_task import reopen_task
from apps.tasks.services.update_task import update_task

from .common import serialize_change

logger = logging.getLogger(__name__)


class SyncRejected(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class SyncConflict(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def push_operations(
    external_user_id: int, operations: Sequence[Mapping[str, object]]
) -> dict[str, object]:
    sync_id = str(uuid4())
    accepted: list[dict[str, object]] = []
    rejected: list[dict[str, object]] = []
    conflicts: list[dict[str, object]] = []
    changes: list[dict[str, object]] = []

    for operation in operations:
        result = _process_operation(external_user_id, operation)
        bucket = {
            "accepted": accepted,
            "rejected": rejected,
            "conflicts": conflicts,
        }[result["result"]]
        bucket.append(result["response"])
        if result.get("change") is not None:
            changes.append(result["change"])

    logger.info(
        "sync_push_completed",
        extra={
            "sync_id": sync_id,
            "accepted_count": len(accepted),
            "rejected_count": len(rejected),
            "conflict_count": len(conflicts),
        },
    )
    return {
        "version": 1,
        "sync_id": sync_id,
        "accepted": accepted,
        "rejected": rejected,
        "conflicts": conflicts,
        "changes": _unique_changes(changes),
    }


def _process_operation(external_user_id: int, operation: Mapping[str, object]) -> dict[str, object]:
    operation_id = _uuid(operation, "operation_id")
    idempotency_key = operation.get("idempotency_key") or operation_id
    if not isinstance(idempotency_key, UUID):
        raise SyncRejected("invalid_idempotency_key", "La clave de idempotencia no es válida.")

    stored = SyncOperation.objects.filter(
        external_user_id=external_user_id,
        idempotency_key=idempotency_key,
    ).first()
    if stored:
        return _stored_result(stored)

    operation_with_id = SyncOperation.objects.filter(id=operation_id).first()
    if operation_with_id:
        return _result(
            "conflicts",
            operation_id,
            "operation_id_reused",
            "El identificador de operación ya pertenece a otra operación.",
        )

    try:
        with transaction.atomic():
            entity = _apply_operation(external_user_id, operation)
            stored = _save_operation(external_user_id, operation, SyncOperation.Result.ACCEPTED, "")
    except SyncConflict as exc:
        stored = _save_failed_operation(
            external_user_id, operation, SyncOperation.Result.CONFLICT, exc.code
        )
        return {"result": "conflicts", "response": _failure_response(stored, exc)}
    except (DjangoValidationError, ProtectedResourceError, ResourceNotFound, SyncRejected) as exc:
        code, message = _error_details(exc)
        stored = _save_failed_operation(
            external_user_id, operation, SyncOperation.Result.REJECTED, code
        )
        return {"result": "rejected", "response": _failure_response(stored, message)}
    except IntegrityError:
        stored = _save_failed_operation(
            external_user_id,
            operation,
            SyncOperation.Result.CONFLICT,
            "entity_exists",
        )
        return {
            "result": "conflicts",
            "response": {
                "operation_id": str(stored.id),
                "code": stored.error_code,
                "message": "La entidad ya existe en el servidor.",
            },
        }

    response = {
        "operation_id": str(stored.id),
        "idempotency_key": str(stored.idempotency_key),
        "duplicate": False,
    }
    return {
        "result": "accepted",
        "response": response,
        "change": serialize_change(operation["entity_type"], entity),
    }


def _apply_operation(external_user_id: int, operation: Mapping[str, object]):
    entity_type = _string(operation, "entity_type")
    entity_id = _uuid(operation, "entity_id")
    mutation = _string(operation, "mutation")
    payload = operation.get("payload")
    if not isinstance(payload, Mapping):
        raise SyncRejected("invalid_payload", "El payload de sincronización no es válido.")
    payload_entity_id = payload.get("entityId", str(entity_id))
    if payload_entity_id != str(entity_id):
        raise SyncRejected("entity_id_mismatch", "El payload no corresponde a la entidad.")

    if entity_type == "list":
        return _apply_list(external_user_id, entity_id, mutation, payload)
    if entity_type == "task":
        return _apply_task(external_user_id, entity_id, mutation, payload)
    raise SyncRejected("invalid_entity_type", "El tipo de entidad no es válido.")


def _apply_list(
    external_user_id: int, entity_id: UUID, mutation: str, payload: Mapping[str, object]
):
    existing = List.objects.filter(id=entity_id, external_user_id=external_user_id).first()
    if mutation == "create":
        if existing:
            raise SyncConflict("entity_exists", "La lista ya existe en el servidor.")
        task_list = List(
            id=entity_id,
            external_user_id=external_user_id,
            name=_required_string(payload, "name"),
            description=_optional_string(payload, "description"),
            emoji=_optional_string(payload, "emoji"),
            color=_optional_string(payload, "color"),
            position=_optional_int(payload, "position", 0),
        )
        task_list.full_clean()
        task_list.save(force_insert=True)
        record_event(
            external_user_id=external_user_id,
            event_type=TaskEvent.EventType.LIST_CREATED,
            payload={"list_id": str(entity_id)},
        )
        return task_list
    if not existing:
        raise SyncRejected("not_found", "La entidad no existe para este usuario.")
    if existing.deleted_at is not None:
        raise SyncConflict("tombstone_wins", "La lista ya fue eliminada en el servidor.")
    if mutation == "update":
        return update_list(
            external_user_id,
            entity_id,
            name=_optional_string_or_none(payload, "name"),
            description=_optional_string_or_none(payload, "description"),
            emoji=_optional_string_or_none(payload, "emoji"),
            color=_optional_string_or_none(payload, "color"),
            position=_optional_int_or_none(payload, "position"),
            is_archived=_optional_bool_or_none(payload, "isArchived"),
        )
    if mutation == "delete":
        delete_list(external_user_id, entity_id)
        return List.objects.get(id=entity_id, external_user_id=external_user_id)
    raise SyncRejected("invalid_mutation", "La mutación no es válida para la lista.")


def _apply_task(
    external_user_id: int, entity_id: UUID, mutation: str, payload: Mapping[str, object]
):
    existing = Task.objects.filter(id=entity_id, external_user_id=external_user_id).first()
    if mutation == "create":
        if existing:
            raise SyncConflict("entity_exists", "La tarea ya existe en el servidor.")
        list_id = _uuid_value(payload.get("listId"), "listId")
        task_list = get_owned_list(external_user_id, list_id)
        task = Task(
            id=entity_id,
            external_user_id=external_user_id,
            list=task_list,
            title=_required_string(payload, "title"),
            description=_optional_string(payload, "description"),
            source=_optional_choice(payload, "source", Task.Source.MANUAL, Task.Source.values),
            position=_optional_int(payload, "position", 0),
        )
        task.full_clean()
        task.save(force_insert=True)
        record_event(
            external_user_id=external_user_id,
            task_id=entity_id,
            event_type=TaskEvent.EventType.TASK_CREATED,
            payload={"source": task.source},
        )
        return task
    if not existing:
        raise SyncRejected("not_found", "La entidad no existe para este usuario.")
    if existing.deleted_at is not None:
        raise SyncConflict("tombstone_wins", "La tarea ya fue eliminada en el servidor.")
    if mutation == "update":
        allowed = {"title", "description", "source", "position", "listId", "status"}
        unknown = set(payload) - allowed - {"entityId"}
        if unknown:
            raise SyncRejected("invalid_payload", "El payload contiene campos no permitidos.")
        values = {
            "title": _optional_string_or_none(payload, "title"),
            "description": _optional_string_or_none(payload, "description"),
            "source": _optional_choice_or_none(payload, "source", Task.Source.values),
            "position": _optional_int_or_none(payload, "position"),
            "list_id": _optional_uuid(payload, "listId"),
        }
        task = update_task(external_user_id, entity_id, **values)
        status = payload.get("status")
        if status is not None:
            if status == Task.Status.COMPLETED:
                task = complete_task(external_user_id, entity_id)
            elif status == Task.Status.PENDING:
                task = reopen_task(external_user_id, entity_id)
            else:
                raise SyncRejected("invalid_status", "El estado de la tarea no es válido.")
        return task
    if mutation == "delete":
        return delete_task(external_user_id, entity_id)
    raise SyncRejected("invalid_mutation", "La mutación no es válida para la tarea.")


def _save_operation(
    external_user_id: int,
    operation: Mapping[str, object],
    result: str,
    error_code: str,
) -> SyncOperation:
    return SyncOperation.objects.create(
        id=_uuid(operation, "operation_id"),
        external_user_id=external_user_id,
        device_id=_uuid(operation, "device_id"),
        entity_type=_string(operation, "entity_type"),
        entity_id=_uuid(operation, "entity_id"),
        operation=_string(operation, "mutation"),
        client_version=int(operation["client_version"]),
        occurred_at=operation["client_timestamp"],
        processed_at=timezone.now(),
        idempotency_key=operation.get("idempotency_key") or _uuid(operation, "operation_id"),
        payload_version=int(operation["payload_version"]),
        payload=dict(operation["payload"]),
        result=result,
        error_code=error_code,
    )


def _save_failed_operation(
    external_user_id: int,
    operation: Mapping[str, object],
    result: str,
    error_code: str,
) -> SyncOperation:
    try:
        with transaction.atomic():
            return _save_operation(external_user_id, operation, result, error_code)
    except IntegrityError:
        return SyncOperation.objects.get(
            external_user_id=external_user_id,
            idempotency_key=operation.get("idempotency_key") or _uuid(operation, "operation_id"),
        )


def _stored_result(operation: SyncOperation) -> dict[str, object]:
    result = operation.result
    response = {
        "operation_id": str(operation.id),
        "idempotency_key": str(operation.idempotency_key),
        "duplicate": True,
    }
    if result == SyncOperation.Result.ACCEPTED:
        return {"result": "accepted", "response": response}
    response.update(
        {
            "code": operation.error_code or "sync_rejected",
            "message": "La operación ya fue procesada.",
        }
    )
    return {
        "result": "conflicts" if result == SyncOperation.Result.CONFLICT else "rejected",
        "response": response,
    }


def _failure_response(operation: SyncOperation, error: Exception | str) -> dict[str, object]:
    return {
        "operation_id": str(operation.id),
        "code": operation.error_code,
        "message": str(error),
    }


def _result(bucket: str, operation_id: UUID, code: str, message: str) -> dict[str, object]:
    return {
        "result": bucket,
        "response": {"operation_id": str(operation_id), "code": code, "message": message},
    }


def _error_details(error: Exception) -> tuple[str, str]:
    if isinstance(error, SyncRejected):
        return error.code, str(error)
    if isinstance(error, ResourceNotFound):
        return "not_found", "La entidad no existe para este usuario."
    if isinstance(error, ProtectedResourceError):
        return "protected_resource", str(error)
    if isinstance(error, DjangoValidationError):
        return "validation_error", "La operación de sincronización no es válida."
    return "sync_rejected", "La operación de sincronización fue rechazada."


def _unique_changes(changes: list[dict[str, object]]) -> list[dict[str, object]]:
    unique: dict[tuple[str, str], dict[str, object]] = {}
    for change in changes:
        key = (str(change["entity_type"]), str(change["entity_id"]))
        unique[key] = change
    return list(unique.values())


def _uuid(operation: Mapping[str, object], key: str) -> UUID:
    return _uuid_value(operation.get(key), key)


def _uuid_value(value: object, key: str) -> UUID:
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise SyncRejected("invalid_uuid", f"El campo {key} no contiene un UUID válido.") from exc


def _string(operation: Mapping[str, object], key: str) -> str:
    value = operation.get(key)
    if not isinstance(value, str):
        raise SyncRejected("invalid_payload", f"El campo {key} no es válido.")
    return value


def _required_string(payload: Mapping[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise SyncRejected("invalid_payload", f"El campo {key} es obligatorio.")
    return value


def _optional_string(payload: Mapping[str, object], key: str) -> str:
    value = payload.get(key, "")
    if not isinstance(value, str):
        raise SyncRejected("invalid_payload", f"El campo {key} no es válido.")
    return value


def _optional_string_or_none(payload: Mapping[str, object], key: str) -> str | None:
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise SyncRejected("invalid_payload", f"El campo {key} no es válido.")
    return value


def _optional_int(payload: Mapping[str, object], key: str, default: int) -> int:
    value = payload.get(key, default)
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise SyncRejected("invalid_payload", f"El campo {key} no es válido.")
    return value


def _optional_int_or_none(payload: Mapping[str, object], key: str) -> int | None:
    value = payload.get(key)
    if value is None:
        return None
    return _optional_int(payload, key, 0)


def _optional_bool_or_none(payload: Mapping[str, object], key: str) -> bool | None:
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, bool):
        raise SyncRejected("invalid_payload", f"El campo {key} no es válido.")
    return value


def _optional_choice(payload: Mapping[str, object], key: str, default: str, choices) -> str:  # type: ignore[no-untyped-def]
    value = payload.get(key, default)
    if value not in choices:
        raise SyncRejected("invalid_payload", f"El campo {key} no es válido.")
    return value


def _optional_choice_or_none(payload: Mapping[str, object], key: str, choices) -> str | None:  # type: ignore[no-untyped-def]
    value = payload.get(key)
    if value is None:
        return None
    if value not in choices:
        raise SyncRejected("invalid_payload", f"El campo {key} no es válido.")
    return value


def _optional_uuid(payload: Mapping[str, object], key: str) -> UUID | None:
    if key not in payload:
        return None
    return _uuid_value(payload[key], key)