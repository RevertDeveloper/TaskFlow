from datetime import UTC, datetime

import pytest
from django.test import Client

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.authentication.infrastructure.accounts_client import AccountsSessionClient
from apps.history.models import TaskEvent
from apps.lists.models import List
from apps.lists.services.delete_list import delete_list
from apps.lists.services.ensure_inbox import ensure_inbox_for_user
from apps.notes.models import Folder, Note
from apps.sync.models import SyncOperation
from apps.tasks.models import Task
from apps.tasks.services.create_task import create_task

pytestmark = pytest.mark.django_db


def principal_for_cookie(self, headers):  # type: ignore[no-untyped-def]
    cookie = headers.get("Cookie", "")
    if "accounts=alice" in cookie:
        return AuthenticatedPrincipal(101, "alice@example.test", "alice", "Alice", "FREE", True)
    if "accounts=bob" in cookie:
        return AuthenticatedPrincipal(202, "bob@example.test", "bob", "Bob", "FREE", True)
    return None


def auth_client(monkeypatch, identity: str) -> Client:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(AccountsSessionClient, "get_current_user", principal_for_cookie)
    client = Client(enforce_csrf_checks=True)
    client.cookies["accounts"] = identity
    csrf_response = client.get("/api/v1/auth/csrf/")
    client.csrf_token = csrf_response.cookies["taskflowcsrftoken"].value
    return client


def push(client: Client, operation: dict[str, object]):
    return client.post(
        "/api/v1/sync/push/",
        data={"version": 1, "operations": [operation]},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=client.csrf_token,
    )


def operation(
    *,
    operation_id: str,
    device_id: str,
    entity_id: str,
    mutation: str,
    payload: dict[str, object],
    idempotency_key: str | None = None,
    client_version: int = 1,
) -> dict[str, object]:
    return {
        "operation_id": operation_id,
        "device_id": device_id,
        "entity_type": "task" if "listId" in payload or "title" in payload else "list",
        "entity_id": entity_id,
        "mutation": mutation,
        "client_version": client_version,
        "client_timestamp": "2026-09-17T10:00:00Z",
        "payload_version": 1,
        "payload": payload,
        "idempotency_key": idempotency_key or operation_id,
    }


def test_push_create_and_retry_is_idempotent(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")
    list_id = "00000000-0000-4000-8000-000000000101"
    op = operation(
        operation_id="00000000-0000-4000-8000-000000000201",
        device_id="00000000-0000-4000-8000-000000000301",
        entity_id=list_id,
        mutation="create",
        payload={"entityId": list_id, "name": "Trabajo"},
    )

    first = push(client, op)
    second = push(client, op)

    assert first.status_code == 200
    assert first.json()["data"]["accepted"][0]["duplicate"] is False
    assert first.json()["data"]["changes"][0]["client_version"] == 1
    assert first.json()["data"]["changes"][0]["operation_id"] == op["operation_id"]
    assert second.status_code == 200
    assert second.json()["data"]["accepted"][0]["duplicate"] is True
    assert List.objects.filter(id=list_id, external_user_id=101).count() == 1
    assert TaskEvent.objects.filter(external_user_id=101, event_type="LIST_CREATED").count() == 1


def test_two_devices_create_tasks_and_pull_returns_both(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")
    inbox = ensure_inbox_for_user(101)
    operations = [
        operation(
            operation_id=f"00000000-0000-4000-8000-00000000020{index}",
            device_id=f"00000000-0000-4000-8000-00000000030{index}",
            entity_id=f"00000000-0000-4000-8000-00000000040{index}",
            mutation="create",
            payload={
                "entityId": f"00000000-0000-4000-8000-00000000040{index}",
                "listId": str(inbox.id),
                "title": f"Dispositivo {index}",
            },
        )
        for index in (1, 2)
    ]

    response = client.post(
        "/api/v1/sync/push/",
        data={"version": 1, "operations": operations},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=client.csrf_token,
    )
    pull_response = client.get("/api/v1/sync/pull/?limit=100")

    assert response.status_code == 200
    assert len(response.json()["data"]["accepted"]) == 2
    pulled_ids = {change["entity_id"] for change in pull_response.json()["data"]["changes"]}
    assert {operation["entity_id"] for operation in operations} <= pulled_ids


def test_pull_cursor_is_repeatable_and_delete_is_a_tombstone(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")
    task_list = List.objects.create(external_user_id=101, name="Temporal")

    first = client.get("/api/v1/sync/pull/?limit=100")
    cursor = first.json()["data"]["cursor"]
    delete_list(101, task_list.id)

    deleted = client.get(f"/api/v1/sync/pull/?cursor={cursor}&limit=100")
    repeated = client.get(f"/api/v1/sync/pull/?cursor={cursor}&limit=100")

    assert deleted.status_code == 200
    deleted_change = next(
        change
        for change in deleted.json()["data"]["changes"]
        if change["entity_id"] == str(task_list.id)
    )
    assert deleted_change["operation"] == "delete"
    assert repeated.json()["data"]["changes"] == deleted.json()["data"]["changes"]


def test_user_cannot_push_a_foreign_entity(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    alice_client = auth_client(monkeypatch, "alice")
    inbox = ensure_inbox_for_user(101)
    task = create_task(101, list_id=inbox.id, title="Privada")
    bob_client = auth_client(monkeypatch, "bob")
    task_id = str(task.id)

    response = push(
        bob_client,
        {
            **operation(
                operation_id="00000000-0000-4000-8000-000000000211",
                device_id="00000000-0000-4000-8000-000000000311",
                entity_id=task_id,
                mutation="update",
                payload={"entityId": task_id, "title": "No autorizado"},
            ),
            "entity_type": "task",
        },
    )

    task.refresh_from_db()
    assert response.status_code == 200
    assert response.json()["data"]["rejected"][0]["code"] == "not_found"
    assert task.title == "Privada"
    assert not SyncOperation.objects.filter(external_user_id=101).exists()
    assert alice_client.get(f"/api/v1/tasks/{task.id}/").status_code == 200


def test_note_sync_assigns_and_clears_an_owned_folder(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")
    folder = Folder.objects.create(external_user_id=101, name="Trabajo", position=0)
    note_id = "00000000-0000-4000-8000-000000000121"
    created = push(client, {
        **operation(
            operation_id="00000000-0000-4000-8000-000000000221",
            device_id="00000000-0000-4000-8000-000000000321",
            entity_id=note_id,
            mutation="create",
            payload={
                "entityId": note_id,
                "title": "Plan",
                "blocks": [],
                "folderId": str(folder.id),
            },
        ),
        "entity_type": "note",
    })

    assert created.json()["data"]["accepted"], created.json()["data"]
    note = Note.objects.get(id=note_id, external_user_id=101)
    assert note.folder_id == folder.id

    moved = push(client, {
        **operation(
            operation_id="00000000-0000-4000-8000-000000000222",
            device_id="00000000-0000-4000-8000-000000000322",
            entity_id=note_id,
            mutation="update",
            payload={"entityId": note_id, "folderId": None},
        ),
        "entity_type": "note",
    })
    note.refresh_from_db()
    assert moved.json()["data"]["accepted"], moved.json()["data"]
    assert note.folder_id is None


def test_note_sync_rejects_a_folder_owned_by_another_user(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")
    foreign_folder = Folder.objects.create(external_user_id=202, name="Privada", position=0)
    note_id = "00000000-0000-4000-8000-000000000122"
    response = push(client, {
        **operation(
            operation_id="00000000-0000-4000-8000-000000000223",
            device_id="00000000-0000-4000-8000-000000000323",
            entity_id=note_id,
            mutation="create",
            payload={
                "entityId": note_id,
                "title": "No autorizada",
                "blocks": [],
                "folderId": str(foreign_folder.id),
            },
        ),
        "entity_type": "note",
    })

    assert response.json()["data"]["rejected"][0]["code"] == "invalid_folder"
    assert not Note.objects.filter(id=note_id).exists()


def test_rejected_operation_is_not_retried_forever(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")
    task_id = "00000000-0000-4000-8000-000000000999"
    op = {
        **operation(
            operation_id="00000000-0000-4000-8000-000000000299",
            device_id="00000000-0000-4000-8000-000000000399",
            entity_id=task_id,
            mutation="update",
            payload={"entityId": task_id, "title": "No existe"},
        ),
        "entity_type": "task",
    }

    first = push(client, op)
    second = push(client, op)

    assert first.json()["data"]["rejected"][0]["code"] == "not_found"
    assert second.json()["data"]["rejected"][0]["duplicate"] is True
    assert SyncOperation.objects.filter(external_user_id=101).count() == 1


def test_cloud_reset_requires_strong_confirmation_and_keeps_accounts_identity(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")
    inbox = ensure_inbox_for_user(101)
    create_task(101, list_id=inbox.id, title="Borrar esta tarea")
    List.objects.create(external_user_id=101, name="Temporal")
    bob_inbox = ensure_inbox_for_user(202)
    create_task(202, list_id=bob_inbox.id, title="No borrar")

    invalid = client.post(
        "/api/v1/data/reset/",
        data={"confirmation": "RESET"},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=client.csrf_token,
    )
    assert invalid.status_code == 400
    assert Task.objects.filter(external_user_id=101).count() == 1

    response = client.post(
        "/api/v1/data/reset/",
        data={"confirmation": "RESET TASKFLOW DATA"},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=client.csrf_token,
    )

    assert response.status_code == 200
    assert Task.objects.filter(external_user_id=101).count() == 0
    assert List.objects.filter(external_user_id=101, is_system=False).count() == 0
    assert List.objects.filter(external_user_id=101, is_system=True).count() == 1
    assert Task.objects.filter(external_user_id=202).count() == 1


def test_later_device_edit_wins_for_the_same_task(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")
    inbox = ensure_inbox_for_user(101)
    task = create_task(101, list_id=inbox.id, title="Inicial")

    first = push(
        client,
        {
            **operation(
                operation_id="00000000-0000-4000-8000-000000000401",
                device_id="00000000-0000-4000-8000-000000000501",
                entity_id=str(task.id),
                mutation="update",
                payload={"entityId": str(task.id), "title": "Dispositivo A"},
            ),
            "entity_type": "task",
        },
    )
    second = push(
        client,
        {
            **operation(
                operation_id="00000000-0000-4000-8000-000000000402",
                device_id="00000000-0000-4000-8000-000000000502",
                entity_id=str(task.id),
                mutation="update",
                payload={"entityId": str(task.id), "title": "Dispositivo B"},
            ),
            "entity_type": "task",
        },
    )

    task.refresh_from_db()
    assert first.json()["data"]["accepted"]
    assert second.json()["data"]["accepted"]
    assert task.title == "Dispositivo B"


def test_equal_server_timestamp_uses_version_and_operation_uuid(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")
    inbox = ensure_inbox_for_user(101)
    fixed_now = datetime(2026, 9, 17, 10, 0, tzinfo=UTC)
    monkeypatch.setattr("django.utils.timezone.now", lambda: fixed_now)
    task = create_task(101, list_id=inbox.id, title="Inicial")

    winner = push(
        client,
        {
            **operation(
                operation_id="00000000-0000-4000-8000-000000000407",
                device_id="00000000-0000-4000-8000-000000000507",
                entity_id=str(task.id),
                mutation="update",
                payload={"entityId": str(task.id), "title": "Version alta"},
                client_version=2,
            ),
            "entity_type": "task",
        },
    )
    loser = push(
        client,
        {
            **operation(
                operation_id="00000000-0000-4000-8000-000000000408",
                device_id="00000000-0000-4000-8000-000000000508",
                entity_id=str(task.id),
                mutation="update",
                payload={"entityId": str(task.id), "title": "Version baja"},
                client_version=1,
            ),
            "entity_type": "task",
        },
    )

    task.refresh_from_db()
    assert winner.json()["data"]["accepted"]
    assert loser.json()["data"]["conflicts"][0]["code"] == "stale_operation"
    assert task.title == "Version alta"


def test_complete_and_edit_keep_the_latest_task_version_coherent(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")
    inbox = ensure_inbox_for_user(101)
    task = create_task(101, list_id=inbox.id, title="Pendiente")

    push(
        client,
        {
            **operation(
                operation_id="00000000-0000-4000-8000-000000000403",
                device_id="00000000-0000-4000-8000-000000000503",
                entity_id=str(task.id),
                mutation="update",
                payload={"entityId": str(task.id), "status": "completed"},
            ),
            "entity_type": "task",
        },
    )
    push(
        client,
        {
            **operation(
                operation_id="00000000-0000-4000-8000-000000000404",
                device_id="00000000-0000-4000-8000-000000000504",
                entity_id=str(task.id),
                mutation="update",
                payload={"entityId": str(task.id), "title": "Completada"},
            ),
            "entity_type": "task",
        },
    )

    task.refresh_from_db()
    assert task.title == "Completada"
    assert task.status == "completed"
    assert task.completed_at is not None


def test_tombstone_rejects_a_later_update_without_resurrecting_entity(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")
    inbox = ensure_inbox_for_user(101)
    task = create_task(101, list_id=inbox.id, title="Borrable")
    task_id = str(task.id)

    deleted = push(
        client,
        {
            **operation(
                operation_id="00000000-0000-4000-8000-000000000405",
                device_id="00000000-0000-4000-8000-000000000505",
                entity_id=task_id,
                mutation="delete",
                payload={"entityId": task_id},
            ),
            "entity_type": "task",
        },
    )
    updated = push(
        client,
        {
            **operation(
                operation_id="00000000-0000-4000-8000-000000000406",
                device_id="00000000-0000-4000-8000-000000000506",
                entity_id=task_id,
                mutation="update",
                payload={"entityId": task_id, "title": "No debe volver"},
            ),
            "entity_type": "task",
        },
    )

    task.refresh_from_db()
    assert deleted.json()["data"]["accepted"]
    assert updated.json()["data"]["conflicts"][0]["code"] == "tombstone_wins"
    assert task.deleted_at is not None
    assert task.title == "Borrable"


def test_sync_rejects_batches_over_protocol_limit(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")
    response = client.post(
        "/api/v1/sync/push/",
        data={"version": 1, "operations": [{}] * 101},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=client.csrf_token,
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"