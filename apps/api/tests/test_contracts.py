import json
from pathlib import Path

import pytest
from django.core.management import call_command
from django.test import Client
from jsonschema import Draft202012Validator

pytestmark = pytest.mark.django_db


PROJECT_ROOT = Path(__file__).resolve().parents[3]
ERROR_SCHEMA = PROJECT_ROOT / "packages" / "schemas" / "error.schema.json"


def test_error_schema_is_valid_and_accepts_api_error_envelope() -> None:
    schema = json.loads(ERROR_SCHEMA.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(
        {
            "error": {
                "code": "validation_error",
                "message": "La solicitud no es válida.",
                "details": {"title": ["Este campo es obligatorio."]},
            }
        }
    )


def test_openapi_endpoint_is_available_and_contains_taskflow_paths() -> None:
    response = Client().get("/api/schema/", HTTP_ACCEPT="application/json")

    assert response.status_code == 200
    document = response.json()
    assert document["openapi"].startswith("3.")
    assert "/api/v1/lists/" in document["paths"]
    assert "/api/v1/tasks/" in document["paths"]
    assert "/api/v1/history/" in document["paths"]
    assert "/api/v1/sync/push/" in document["paths"]
    assert "/api/v1/sync/pull/" in document["paths"]
    assert "/api/v1/data/reset/" in document["paths"]


def test_openapi_generation_validates() -> None:
    call_command("spectacular", "--validate", verbosity=0)
