from uuid import UUID

import pytest
from django.test import Client

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.authentication.infrastructure.accounts_client import AccountsSessionClient
from apps.history.models import TaskEvent
from apps.lists.services.ensure_inbox import ensure_inbox_for_user
from apps.tasks.models import Task
from apps.tasks.services.create_task import create_task

pytestmark = pytest.mark.django_db


def principal_for_cookie(self, headers):  # type: ignore[no-untyped-def]
    cookie = headers.get("Cookie", "")
    if "accounts=alice" in cookie:
        user_id, username = 101, "alice"
    elif "accounts=bob" in cookie:
        user_id, username = 202, "bob"
    else:
        return None
    return AuthenticatedPrincipal(
        external_user_id=user_id,
        email=f"{username}@example.test",
        username=username,
        display_name=username.title(),
        plan="FREE",
        email_verified=True,
    )


def csrf_token(client: Client) -> str:
    response = client.get("/api/v1/auth/csrf/")
    return response.cookies["taskflowcsrftoken"].value


def auth_client(monkeypatch, identity: str) -> Client:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(AccountsSessionClient, "get_current_user", principal_for_cookie)
    client = Client(enforce_csrf_checks=True)
    client.cookies["accounts"] = identity
    client.csrf_token = csrf_token(client)
    return client


def mutate(client: Client, method: str, path: str, data=None):  # type: ignore[no-untyped-def]
    return getattr(client, method)(
        path,
        data=data,
        content_type="application/json",
        HTTP_X_CSRFTOKEN=client.csrf_token,
    )


def test_private_api_requires_accounts_identity(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(AccountsSessionClient, "get_current_user", lambda self, headers: None)

    response = Client().get("/api/v1/lists/")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "authentication_required"


def test_crud_state_transitions_and_history(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")

    created_list = mutate(
        client,
        "post",
        "/api/v1/lists/",
        {"name": "Trabajo"},
    )
    assert created_list.status_code == 201
    list_id = created_list.json()["data"]["id"]

    created_task = mutate(
        client,
        "post",
        "/api/v1/tasks/",
        {"list_id": list_id, "title": "Revisar contrato"},
    )
    assert created_task.status_code == 201
    task_id = created_task.json()["data"]["id"]
    assert created_task.json()["data"]["status"] == Task.Status.PENDING

    completed = mutate(client, "post", f"/api/v1/tasks/{task_id}/complete/")
    assert completed.status_code == 200
    assert completed.json()["data"]["status"] == Task.Status.COMPLETED

    history = client.get("/api/v1/history/?page_size=2")
    assert history.status_code == 200
    assert history.json()["meta"]["page_size"] == 2
    assert {entry["event_type"] for entry in history.json()["data"]} == {
        TaskEvent.EventType.TASK_CREATED,
        TaskEvent.EventType.TASK_COMPLETED,
    }

    reopened = mutate(client, "post", f"/api/v1/tasks/{task_id}/reopen/")
    assert reopened.status_code == 200
    assert reopened.json()["data"]["completed_at"] is None

    deleted = mutate(client, "delete", f"/api/v1/tasks/{task_id}/")
    assert deleted.status_code == 204
    assert deleted.content == b""


def test_user_isolation_applies_to_read_and_mutation(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    alice_client = auth_client(monkeypatch, "alice")
    inbox = ensure_inbox_for_user(101)
    task = create_task(101, list_id=inbox.id, title="Privada")
    bob_client = auth_client(monkeypatch, "bob")

    for method, path in (
        ("get", f"/api/v1/tasks/{task.id}/"),
        ("patch", f"/api/v1/tasks/{task.id}/"),
        ("delete", f"/api/v1/tasks/{task.id}/"),
        ("post", f"/api/v1/tasks/{task.id}/complete/"),
        ("post", f"/api/v1/tasks/{task.id}/reopen/"),
    ):
        response = mutate(
            bob_client,
            method,
            path,
            {"title": "No autorizado"} if method == "patch" else None,
        )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "not_found"

    assert bob_client.get("/api/v1/tasks/").json()["meta"]["total_count"] == 0
    assert bob_client.get(f"/api/v1/lists/{inbox.id}/history/").status_code == 404
    assert alice_client.get(f"/api/v1/tasks/{task.id}/").status_code == 200


def test_filters_validation_pagination_and_foreign_list_are_safe(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")
    inbox = ensure_inbox_for_user(101)
    for index in range(3):
        create_task(101, list_id=inbox.id, title=f"Pendiente {index}")

    filtered = client.get(f"/api/v1/tasks/?status=pending&list_id={inbox.id}&page_size=2")
    assert filtered.status_code == 200
    assert len(filtered.json()["data"]) == 2
    assert filtered.json()["meta"]["total_count"] == 3

    invalid = client.get("/api/v1/tasks/?status=unknown")
    assert invalid.status_code == 400
    assert invalid.json()["error"]["code"] == "validation_error"

    foreign_list = UUID(int=999)
    response = mutate(
        client,
        "post",
        "/api/v1/tasks/",
        {"list_id": str(foreign_list), "title": "No existe"},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_mutations_require_taskflow_csrf(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = auth_client(monkeypatch, "alice")

    response = client.post(
        "/api/v1/lists/",
        data={"name": "Sin CSRF"},
        content_type="application/json",
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permission_denied"
