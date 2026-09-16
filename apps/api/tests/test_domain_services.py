import importlib
import uuid

import pytest
from django.core.exceptions import ValidationError

from apps.common.exceptions import ProtectedResourceError, ResourceNotFound
from apps.history.models import TaskEvent
from apps.lists.models import List
from apps.lists.services import (
    EnsureInboxForUser,
    create_list,
    delete_list,
    ensure_inbox_for_user,
    reorder_lists,
    update_list,
)
from apps.tasks.models import Task
from apps.tasks.services import (
    complete_task,
    create_task,
    delete_task,
    move_task,
    reopen_task,
    update_task,
)

pytestmark = pytest.mark.django_db


def test_inbox_is_idempotent_and_isolated_per_user() -> None:
    first = ensure_inbox_for_user(101)
    second = EnsureInboxForUser(101).execute()
    other_user = ensure_inbox_for_user(202)

    assert first.id == second.id
    assert first.name == "Inbox"
    assert first.is_system is True
    assert other_user.id != first.id
    assert List.objects.filter(is_system=True).count() == 2


def test_inbox_cannot_be_renamed_archived_or_deleted() -> None:
    inbox = ensure_inbox_for_user(101)

    with pytest.raises(ProtectedResourceError):
        update_list(101, inbox.id, name="Renamed")
    with pytest.raises(ProtectedResourceError):
        update_list(101, inbox.id, is_archived=True)
    with pytest.raises(ProtectedResourceError):
        delete_list(101, inbox.id)


def test_deleting_a_list_moves_tasks_to_inbox_and_preserves_events() -> None:
    source = create_list(101, name="Work")
    task = create_task(101, list_id=source.id, title="Prepare release")
    event_count = TaskEvent.objects.count()

    delete_list(101, source.id)

    inbox = List.objects.get(external_user_id=101, is_system=True)
    task.refresh_from_db()
    assert not List.objects.filter(id=source.id).exists()
    assert task.list_id == inbox.id
    assert TaskEvent.objects.count() == event_count + 2
    assert TaskEvent.objects.filter(
        task_id=task.id,
        event_type=TaskEvent.EventType.TASK_MOVED,
    ).exists()
    assert TaskEvent.objects.filter(
        task_id__isnull=True,
        event_type=TaskEvent.EventType.LIST_DELETED,
    ).exists()


def test_task_lifecycle_is_idempotent_and_audited() -> None:
    inbox = ensure_inbox_for_user(101)
    task = create_task(101, list_id=inbox.id, title="Ship feature")

    complete_task(101, task.id)
    complete_task(101, task.id)
    reopen_task(101, task.id)
    reopen_task(101, task.id)

    task.refresh_from_db()
    assert task.status == Task.Status.PENDING
    assert task.completed_at is None
    assert TaskEvent.objects.filter(
        task_id=task.id,
        event_type=TaskEvent.EventType.TASK_COMPLETED,
    ).count() == 1
    assert TaskEvent.objects.filter(
        task_id=task.id,
        event_type=TaskEvent.EventType.TASK_REOPENED,
    ).count() == 1


def test_user_cannot_read_or_mutate_another_users_task() -> None:
    owner_inbox = ensure_inbox_for_user(101)
    other_inbox = ensure_inbox_for_user(202)
    task = create_task(101, list_id=owner_inbox.id, title="Private task")

    with pytest.raises(ResourceNotFound):
        update_task(202, task.id, title="Stolen")
    with pytest.raises(ResourceNotFound):
        complete_task(202, task.id)
    with pytest.raises(ResourceNotFound):
        move_task(202, task.id, list_id=other_inbox.id)
    with pytest.raises(ResourceNotFound):
        delete_task(202, task.id)

    task.refresh_from_db()
    assert task.title == "Private task"
    assert task.status == Task.Status.PENDING
    assert task.deleted_at is None


def test_task_cannot_be_created_or_moved_to_archived_list() -> None:
    archived = create_list(101, name="Old", position=1)
    update_list(101, archived.id, is_archived=True)

    with pytest.raises(ValidationError, match="archived"):
        create_task(101, list_id=archived.id, title="Invalid")

    inbox = ensure_inbox_for_user(101)
    task = create_task(101, list_id=inbox.id, title="Move me")
    with pytest.raises(ValidationError, match="archived"):
        move_task(101, task.id, list_id=archived.id)


def test_reorder_requires_exactly_the_users_lists() -> None:
    inbox = ensure_inbox_for_user(101)
    work = create_list(101, name="Work", position=1)
    personal = create_list(101, name="Personal", position=2)

    reordered = reorder_lists(101, [personal.id, inbox.id, work.id])
    assert [task_list.id for task_list in reordered] == [personal.id, inbox.id, work.id]
    ordered_ids = list(
        List.objects.filter(external_user_id=101)
        .order_by("position")
        .values_list("id", flat=True)
    )
    assert ordered_ids == [
        personal.id,
        inbox.id,
        work.id,
    ]

    with pytest.raises(ResourceNotFound):
        reorder_lists(101, [uuid.uuid4(), inbox.id, work.id])


def test_soft_delete_keeps_task_and_adds_one_event() -> None:
    inbox = ensure_inbox_for_user(101)
    task = create_task(101, list_id=inbox.id, title="Archive me")

    delete_task(101, task.id)
    delete_task(101, task.id)

    task.refresh_from_db()
    assert task.deleted_at is not None
    assert TaskEvent.objects.filter(
        task_id=task.id,
        event_type=TaskEvent.EventType.TASK_DELETED,
    ).count() == 1


def test_task_creation_rolls_back_when_event_recording_fails(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    inbox = ensure_inbox_for_user(101)

    def fail_event(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise RuntimeError("event store unavailable")

    create_task_module = importlib.import_module("apps.tasks.services.create_task")
    monkeypatch.setattr(create_task_module, "record_event", fail_event)

    with pytest.raises(RuntimeError, match="event store unavailable"):
        create_task(101, list_id=inbox.id, title="Atomic task")

    assert not Task.objects.filter(title="Atomic task").exists()
    assert not TaskEvent.objects.filter(event_type=TaskEvent.EventType.TASK_CREATED).exists()
