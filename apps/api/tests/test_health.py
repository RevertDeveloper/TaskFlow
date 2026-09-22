import json
import logging
from unittest.mock import patch
from uuid import UUID

import pytest
from django.test import Client, override_settings

from apps.common.middleware import JsonLogFormatter

pytestmark = pytest.mark.django_db


def test_health_reports_live_process() -> None:
    response = Client().get("/health/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_api_health_reports_live_process() -> None:
    response = Client().get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_rewritten_api_health_and_ready_paths_accept_trailing_slashes() -> None:
    client = Client()

    assert client.get("/api/health/").status_code == 200
    assert client.get("/api/ready/").status_code in {200, 503}


def test_api_ready_reports_database_and_migrations() -> None:
    response = Client().get("/api/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "ready": True,
        "checks": {"configuration": True, "database": True, "migrations": True},
    }


def test_api_ready_returns_503_without_internal_dependency_details() -> None:
    with patch("config.health._database_ready", return_value=False):
        response = Client().get("/api/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "unavailable",
        "ready": False,
        "checks": {"configuration": True, "database": False, "migrations": False},
    }
    assert "secret" not in response.content.decode().lower()


@override_settings(TASKFLOW_METRICS_TOKEN="metrics-test-token")
def test_metrics_endpoint_requires_token_and_returns_prometheus_payload() -> None:
    forbidden = Client().get("/api/metrics")
    assert forbidden.status_code == 403

    allowed = Client().get("/api/metrics", HTTP_X_METRICS_TOKEN="metrics-test-token")

    assert allowed.status_code == 200
    assert allowed["Content-Type"].startswith("text/plain")
    assert b"taskflow_http_requests_total" in allowed.content


def test_request_id_is_preserved_when_valid() -> None:
    response = Client().get("/api/health", HTTP_X_REQUEST_ID="health-check-42")

    assert response["X-Request-ID"] == "health-check-42"


def test_request_id_is_generated_when_missing_or_invalid_and_returned_on_errors() -> None:
    generated = Client().get("/api/health")
    invalid = Client().get("/api/health", HTTP_X_REQUEST_ID="bad\r\nvalue")
    error = Client().get("/route-that-does-not-exist", HTTP_X_REQUEST_ID="error-check")

    UUID(generated["X-Request-ID"])
    UUID(invalid["X-Request-ID"])
    assert error.status_code == 404
    assert error["X-Request-ID"] == "error-check"


def test_request_logs_are_structured_without_private_request_data() -> None:
    record = logging.LogRecord(
        name="taskflow.request",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="request_completed",
        args=(),
        exc_info=None,
    )
    record.request_id = "request-42"
    record.method = "GET"
    record.path = "/api/health"
    record.status_code = 200
    record.cookies = "session-secret"
    record.body = "private payload"

    payload = json.loads(JsonLogFormatter().format(record))

    assert payload == {
        "timestamp": payload["timestamp"],
        "level": "info",
        "event": "request_completed",
        "request_id": "request-42",
        "method": "GET",
        "path": "/api/health",
        "status_code": 200,
    }
    assert "cookies" not in payload
    assert "body" not in payload