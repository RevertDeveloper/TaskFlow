import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

DOMAIN_TARGETS = [
    ("lists", "0003_list_one_system_list_per_user"),
    ("tasks", "0002_alter_task_external_user_id"),
    ("history", "0002_alter_taskevent_external_user_id"),
    ("sync", "0002_alter_syncoperation_external_user_id"),
    ("voice", "0002_alter_voicesession_external_user_id"),
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
