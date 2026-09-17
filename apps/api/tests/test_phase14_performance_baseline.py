import json
from time import perf_counter

import pytest
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.authentication.infrastructure.accounts_client import AccountsSessionClient
from apps.history.models import TaskEvent
from apps.lists.models import List
from apps.lists.services.ensure_inbox import ensure_inbox_for_user
from apps.tasks.models import Task

pytestmark = pytest.mark.django_db


def test_phase14_api_baseline_is_recorded(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(
        AccountsSessionClient,
        "get_current_user",
        lambda self, headers: AuthenticatedPrincipal(
            101,
            "alice@example.test",
            "alice",
            "Alice",
            "FREE",
            True,
        ),
    )
    _seed_representative_volume()
    client = Client()

    dashboard = _measure_dashboard(client)
    tasks = _measure_single_request(client, "/api/v1/tasks/?page_size=100")
    history = _measure_single_request(client, "/api/v1/history/?page_size=100")

    baseline = {
        "volume": {"lists": 20, "tasks": 1000, "events": 5000},
        "dashboard": dashboard,
        "tasks": tasks,
        "history": history,
    }
    print(f"PHASE14_API_BASELINE {json.dumps(baseline, sort_keys=True)}")


def _seed_representative_volume() -> None:
    inbox = ensure_inbox_for_user(101)
    List.objects.bulk_create(
        [
            List(external_user_id=101, name=f"Lista {index}", position=index)
            for index in range(1, 20)
        ]
    )
    tasks = [
        Task(
            external_user_id=101,
            list_id=inbox.id,
            title=f"Tarea {index}",
            position=index,
        )
        for index in range(1000)
    ]
    Task.objects.bulk_create(tasks)
    TaskEvent.objects.bulk_create(
        [
            TaskEvent(
                external_user_id=101,
                task_id=tasks[index % len(tasks)].id,
                event_type=TaskEvent.EventType.TASK_UPDATED,
                payload={"index": index},
            )
            for index in range(5000)
        ]
    )


def _measure_dashboard(client: Client) -> dict[str, object]:
    with CaptureQueriesContext(connection) as queries:
        started_at = perf_counter()
        lists_response = client.get("/api/v1/lists/?page_size=100")
        tasks_response = client.get("/api/v1/tasks/?page_size=100")
        duration_ms = (perf_counter() - started_at) * 1000
    assert lists_response.status_code == 200
    assert tasks_response.status_code == 200
    return {
        "duration_ms": round(duration_ms, 2),
        "query_count": len(queries),
        "list_items": len(lists_response.json()["data"]),
        "task_items": len(tasks_response.json()["data"]),
    }


def _measure_single_request(client: Client, path: str) -> dict[str, object]:
    with CaptureQueriesContext(connection) as queries:
        started_at = perf_counter()
        response = client.get(path)
        duration_ms = (perf_counter() - started_at) * 1000
    assert response.status_code == 200
    payload = response.json()
    return {
        "duration_ms": round(duration_ms, 2),
        "query_count": len(queries),
        "items": len(payload["data"]),
        "total_count": payload["meta"]["total_count"],
    }