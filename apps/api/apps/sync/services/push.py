import logging
from collections.abc import Mapping, Sequence
from typing import NotRequired, TypedDict
from uuid import UUID, uuid4

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.common.exceptions import ProtectedResourceError, ResourceNotFound
from apps.common.metrics import observe_sync_result
from apps.common.middleware import current_request_id
from apps.history.models import TaskEvent
from apps.history.services import record_event
from apps.lists.models import List
from apps.lists.selectors import get_owned_list
from apps.lists.services.delete_list import delete_list
from apps.lists.services.update_list import update_list
from apps.notes.models import Note
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


class SyncProcessResult(TypedDict):
    result: str
    response: dict[str, object]
    change: NotRequired[dict[str, object]]


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
        buckets: dict[str, list[dict[str, object]]] = {
            "accepted": accepted,
            "rejected": rejected,
            "conflicts": conflicts,
        }
        bucket = buckets[result["result"]]
        bucket.append(result["response"])
        observe_sync_result(result["result"])
        logger.info(
            "sync_operation_processed",
            extra={
                "sync_id": sync_id,
                "operation_id": result["response"].get("operation_id"),
                "result": result["result"],
                "request_id": current_request_id(),
            },
        )
        if result.get("change") is not None:
            changes.append(result["change"])

    logger.info(
        "sync_push_completed",
        extra={
            "sync_id": sync_id,
            "accepted_count": len(accepted),
            "rejected_count": len(rejected),
            "conflict_count": len(conflicts),
            "request_id": current_request_id(),
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


def _process_operation(
    external_user_id: int, operation: Mapping[str, object]
) -> SyncProcessResult:
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
            previous = _existing_entity(external_user_id, operation)
            entity = _apply_operation(external_user_id, operation)
            _ensure_lww_order(previous, entity, operation)
            _stamp_sync_version(entity, operation)
            stored = _save_operation(
                external_user_id, operation, str(SyncOperation.Result.ACCEPTED), ""
            )
    except SyncConflict as exc:
        stored = _save_failed_operation(
            external_user_id, operation, str(SyncOperation.Result.CONFLICT), exc.code
        )
        return {"result": "conflicts", "response": _failure_response(stored, exc)}
    except (DjangoValidationError, ProtectedResourceError, ResourceNotFound, SyncRejected) as exc:
        code, message = _error_details(exc)
        stored = _save_failed_operation(
            external_user_id, operation, str(SyncOperation.Result.REJECTED), code
        )
        return {"result": "rejected", "response": _failure_response(stored, message)}
    except IntegrityError:
        stored = _save_failed_operation(
            external_user_id,
            operation,
            str(SyncOperation.Result.CONFLICT),
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
        "change": serialize_change(_string(operation, "entity_type"), entity),
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
    if entity_type == "note":
        return _apply_note(external_user_id, entity_id, mutation, payload)
    raise SyncRejected("invalid_entity_type", "El tipo de entidad no es válido.")


def _existing_entity(external_user_id: int, operation: Mapping[str, object]):
    entity_type = operation.get("entity_type")
    entity_id = _uuid(operation, "entity_id")
    if entity_type == "list":
        return List.objects.select_for_update().filter(
            id=entity_id,
            external_user_id=external_user_id,
        ).first()
    if entity_type == "task":
        return Task.objects.select_for_update().filter(
            id=entity_id,
            external_user_id=external_user_id,
        ).first()
    if entity_type == "note":
        return Note.objects.select_for_update().filter(
            id=entity_id,
            external_user_id=external_user_id,
        ).first()
    return None


def _ensure_lww_order(previous, entity, operation) -> None:
    if previous is None:
        return
    if entity.updated_at < previous.updated_at:
        raise SyncConflict("stale_operation", "La operación es más antigua que el estado remoto.")
    if entity.updated_at != previous.updated_at:
        return

    candidate = _version_key(
        _integer(operation, "client_version"), _uuid(operation, "operation_id")
    )
    current = _version_key(previous.sync_client_version or 0, previous.sync_operation_id)
    if candidate <= current:
        raise SyncConflict("stale_operation", "La operación pierde el desempate de sincronización.")


def _stamp_sync_version(entity, operation: Mapping[str, object]) -> None:
    entity.sync_client_version = _integer(operation, "client_version")
    entity.sync_operation_id = _uuid(operation, "operation_id")
    entity.save(update_fields=["sync_client_version", "sync_operation_id"])


def _version_key(client_version: object, operation_id: UUID | None) -> tuple[int, str]:
    if not isinstance(client_version, int) or isinstance(client_version, bool):
        raise SyncRejected("invalid_payload", "El campo client_version no es válido.")
    return client_version, str(operation_id or "")


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
            event_type=str(TaskEvent.EventType.LIST_CREATED),
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
            source=_optional_choice(
                payload, "source", str(Task.Source.MANUAL), Task.Source.values
            ),
            position=_optional_int(payload, "position", 0),
        )
        task.full_clean()
        task.save(force_insert=True)
        record_event(
            external_user_id=external_user_id,
            task_id=entity_id,
            event_type=str(TaskEvent.EventType.TASK_CREATED),
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


def _apply_note(
    external_user_id: int, entity_id: UUID, mutation: str, payload: Mapping[str, object]
):
    existing = Note.objects.filter(id=entity_id, external_user_id=external_user_id).first()
    if mutation == "create":
        if existing:
            raise SyncConflict("entity_exists", "La nota ya existe en el servidor.")
        note = Note(
            id=entity_id,
            external_user_id=external_user_id,
            title=_optional_string(payload, "title"),
            blocks=payload.get("blocks", []),
            tags=payload.get("tags", []),
            pinned=_optional_bool_or_none(payload, "pinned") or False,
        )
        note.full_clean()
        note.save(force_insert=True)
        return note
    if not existing:
        raise SyncRejected("not_found", "La entidad no existe para este usuario.")
    if existing.deleted_at is not None:
        raise SyncConflict("tombstone_wins", "La nota ya fue eliminada en el servidor.")
    if mutation == "update":
        allowed = {"title", "blocks", "tags", "pinned", "archivedAt", "folderId", "entityId"}
        if set(payload) - allowed:
            raise SyncRejected("invalid_payload", "El payload contiene campos no permitidos.")
        for field, key in (("title", "title"), ("blocks", "blocks"), ("tags", "tags"), ("pinned", "pinned")):
            if key in payload:
                setattr(existing, field, payload[key])
        if "archivedAt" in payload:
            existing.archived_at = payload["archivedAt"]
        existing.full_clean()
        existing.save()
        return existing
    if mutation == "delete":
        existing.deleted_at = timezone.now()
        existing.save(update_fields=["deleted_at", "updated_at"])
        return existing
    raise SyncRejected("invalid_mutation", "La mutación no es válida para la nota.")


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
        client_version=_integer(operation, "client_version"),
        occurred_at=operation["client_timestamp"],
        processed_at=timezone.now(),
        idempotency_key=operation.get("idempotency_key") or _uuid(operation, "operation_id"),
        payload_version=_integer(operation, "payload_version"),
        payload=dict(_mapping(operation, "payload")),
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


def _stored_result(operation: SyncOperation) -> SyncProcessResult:
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


def _result(bucket: str, operation_id: UUID, code: str, message: str) -> SyncProcessResult:
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


def _integer(operation: Mapping[str, object], key: str) -> int:
    value = operation.get(key)
    if not isinstance(value, int) or isinstance(value, bool):
        raise SyncRejected("invalid_payload", f"El campo {key} no es válido.")
    return value


def _mapping(operation: Mapping[str, object], key: str) -> Mapping[str, object]:
    value = operation.get(key)
    if not isinstance(value, Mapping):
        raise SyncRejected("invalid_payload", f"El campo {key} no es válido.")
    return value


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


def _optional_choice(
    payload: Mapping[str, object], key: str, default: str, choices: Sequence[str]
) -> str:
    value = payload.get(key, default)
    if not isinstance(value, str) or value not in choices:
        raise SyncRejected("invalid_payload", f"El campo {key} no es válido.")
    return value


def _optional_choice_or_none(
    payload: Mapping[str, object], key: str, choices: Sequence[str]
) -> str | None:
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or value not in choices:
        raise SyncRejected("invalid_payload", f"El campo {key} no es válido.")
    return value


def _optional_uuid(payload: Mapping[str, object], key: str) -> UUID | None:
    if key not in payload:
        return None
    return _uuid_value(payload[key], key)