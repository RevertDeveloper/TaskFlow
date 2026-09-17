from time import perf_counter

import pytest

from apps.sync.services.push import push_operations

pytestmark = pytest.mark.django_db


def test_sync_push_batch_of_100_has_representative_baseline() -> None:
    operations = [
        {
            "operation_id": f"00000000-0000-4000-8000-{index:012d}",
            "device_id": f"00000000-0000-4000-8001-{index:012d}",
            "entity_type": "list",
            "entity_id": f"00000000-0000-4000-8002-{index:012d}",
            "mutation": "create",
            "client_version": index,
            "client_timestamp": "2026-09-17T10:00:00Z",
            "payload_version": 1,
            "payload": {
                "entityId": f"00000000-0000-4000-8002-{index:012d}",
                "name": f"Carga {index}",
            },
        }
        for index in range(1, 101)
    ]

    started = perf_counter()
    result = push_operations(101, operations)
    elapsed_ms = (perf_counter() - started) * 1_000

    assert len(result["accepted"]) == 100
    assert result["rejected"] == []
    assert result["conflicts"] == []
    assert elapsed_ms < 5_000
    print(f"sync_load_baseline operations=100 elapsed_ms={elapsed_ms:.2f}")