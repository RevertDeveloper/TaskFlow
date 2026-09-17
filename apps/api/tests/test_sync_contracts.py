import json
import os
from pathlib import Path

from jsonschema import Draft202012Validator

PROJECT_ROOT = Path(
    os.environ["TASKFLOW_REPO_ROOT"]
    if "TASKFLOW_REPO_ROOT" in os.environ
    else Path(__file__).resolve().parents[3]
)


def test_sync_schemas_are_valid() -> None:
    for filename in ("sync-push.schema.json", "sync-pull.schema.json"):
        schema = json.loads((PROJECT_ROOT / "packages" / "schemas" / filename).read_text())
        Draft202012Validator.check_schema(schema)


def test_sync_push_schema_rejects_oversized_batches() -> None:
    schema = json.loads(
        (PROJECT_ROOT / "packages" / "schemas" / "sync-push.schema.json").read_text()
    )
    validator = Draft202012Validator(schema)
    operation = {
        "operation_id": "00000000-0000-4000-8000-000000000001",
        "device_id": "00000000-0000-4000-8000-000000000002",
        "entity_type": "task",
        "entity_id": "00000000-0000-4000-8000-000000000003",
        "mutation": "update",
        "client_version": 1,
        "client_timestamp": "2026-09-17T10:00:00Z",
        "payload_version": 1,
        "payload": {"entityId": "00000000-0000-4000-8000-000000000003"},
    }

    errors = list(validator.iter_errors({"version": 1, "operations": [operation] * 101}))

    assert errors