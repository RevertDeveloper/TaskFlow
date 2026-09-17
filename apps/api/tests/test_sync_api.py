import pytest
from django.test import Client

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.authentication.infrastructure.accounts_client import AccountsSessionClient
from apps.history.models import TaskEvent
from apps.lists.models import List
from apps.lists.services.delete_list import delete_list
from apps.lists.services.ensure_inbox import ensure_inbox_for_user
from apps.sync.models import SyncOperation
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
) -> dict[str, object]:
    return {
        "operation_id": operation_id,
        "device_id": device_id,
        "entity_type": "task" if "listId" in payload or "title" in payload else "list",
        "entity_id": entity_id,
        "mutation": mutation,
        "client_version": 1,
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