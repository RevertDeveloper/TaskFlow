import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

DOMAIN_TARGETS = [
    ("lists", "0005_list_sync_metadata"),
    ("tasks", "0003_task_sync_metadata"),
    ("history", "0002_alter_taskevent_external_user_id"),
    ("sync", "0003_syncoperation_result"),
    ("voice", "0004_voicesession_quota_validated"),
]
DOMAIN_ZERO_TARGETS = [
    ("voice", None),
    ("sync", None),
    ("history", None),
    ("tasks", None),
    ("lists", None),
]


@pytest.mark.django_db(transaction=True)
def test_domain_migrations_apply_and_reverse() -> None:
    executor = MigrationExecutor(connection)
    executor.migrate(DOMAIN_TARGETS)
    tables = set(connection.introspection.table_names())

    assert {
        "lists_list",
        "tasks_task",
        "history_taskevent",
        "sync_syncoperation",
        "voice_voicesession",
    } <= tables

    executor.migrate(DOMAIN_ZERO_TARGETS)
    tables = set(connection.introspection.table_names())
    assert not {
        "lists_list",
        "tasks_task",
        "history_taskevent",
        "sync_syncoperation",
        "voice_voicesession",
    } & tables

    executor = MigrationExecutor(connection)
    executor.migrate(DOMAIN_TARGETS)
    tables = set(connection.introspection.table_names())
    assert {
        "lists_list",
        "tasks_task",
        "history_taskevent",
        "sync_syncoperation",
        "voice_voicesession",
    } <= tables
