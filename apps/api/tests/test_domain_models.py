import uuid

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.history.models import TaskEvent
from apps.history.selectors import events_for_user
from apps.lists.models import List
from apps.sync.models import SyncOperation
from apps.sync.selectors import operations_for_user
from apps.tasks.models import Task
from apps.voice.models import VoiceSession
from apps.voice.selectors import voice_sessions_for_user

pytestmark = pytest.mark.django_db


def test_domain_records_use_global_uuids_and_timezone_aware_audit_fields() -> None:
    task_list = List.objects.create(external_user_id=101, name="Inbox", is_system=True)
    task = Task.objects.create(external_user_id=101, list=task_list, title="Review roadmap")
    event = TaskEvent.objects.create(
        external_user_id=101,
        task_id=task.id,
        event_type=TaskEvent.EventType.TASK_CREATED,
        payload={"source": "manual"},
    )
    operation = SyncOperation.objects.create(
        external_user_id=101,
        device_id=uuid.uuid4(),
        entity_type="task",
        entity_id=task.id,
        operation=SyncOperation.Operation.CREATE,
        occurred_at=timezone.now(),
    )
    voice_session = VoiceSession.objects.create(external_user_id=101)

    for record in (task_list, task, event, operation, voice_session):
        assert isinstance(record.id, uuid.UUID)
        assert timezone.is_aware(record.created_at)
        assert timezone.is_aware(record.updated_at)

    assert task.status == Task.Status.PENDING
    assert task.deleted_at is None
    assert voice_session.provider_metadata == {}


def test_task_rejects_a_list_owned_by_another_user() -> None:
    task_list = List.objects.create(external_user_id=101, name="Private")
    task = Task(external_user_id=202, list=task_list, title="Must not cross tenant")

    with pytest.raises(ValidationError, match="same user"):
        task.full_clean()


def test_task_status_and_title_invariants_are_validated() -> None:
    task_list = List.objects.create(external_user_id=101, name="Inbox")
    completed_without_timestamp = Task(
        external_user_id=101,
        list=task_list,
        title="Completed",
        status=Task.Status.COMPLETED,
    )
    blank_title = Task(external_user_id=101, list=task_list, title="   ")

    with pytest.raises(ValidationError, match="completed_at"):
        completed_without_timestamp.full_clean()
    with pytest.raises(ValidationError, match="cannot be blank"):
        blank_title.full_clean()


def test_list_name_and_external_user_id_are_validated() -> None:
    blank_name = List(external_user_id=101, name="  ")
    invalid_user = List(external_user_id=0, name="Inbox")

    with pytest.raises(ValidationError, match="cannot be blank"):
        blank_name.full_clean()
    with pytest.raises(ValidationError) as raised:
        invalid_user.full_clean()
    assert "external_user_id" in raised.value.message_dict


def test_sync_idempotency_key_is_scoped_to_user() -> None:
    idempotency_key = uuid.uuid4()
    operation_data = {
        "device_id": uuid.uuid4(),
        "entity_type": "task",
        "entity_id": uuid.uuid4(),
        "operation": SyncOperation.Operation.CREATE,
        "occurred_at": timezone.now(),
        "idempotency_key": idempotency_key,
    }
    SyncOperation.objects.create(external_user_id=101, **operation_data)
    SyncOperation.objects.create(external_user_id=202, **operation_data)

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            SyncOperation.objects.create(external_user_id=101, **operation_data)


def test_auxiliary_selectors_are_scoped_to_external_user_id() -> None:
    TaskEvent.objects.create(
        external_user_id=101,
        event_type=TaskEvent.EventType.LIST_CREATED,
    )
    TaskEvent.objects.create(
        external_user_id=202,
        event_type=TaskEvent.EventType.LIST_CREATED,
    )
    SyncOperation.objects.create(
        external_user_id=101,
        device_id=uuid.uuid4(),
        entity_type="task",
        entity_id=uuid.uuid4(),
        operation=SyncOperation.Operation.CREATE,
        occurred_at=timezone.now(),
    )
    SyncOperation.objects.create(
        external_user_id=202,
        device_id=uuid.uuid4(),
        entity_type="task",
        entity_id=uuid.uuid4(),
        operation=SyncOperation.Operation.CREATE,
        occurred_at=timezone.now(),
    )
    VoiceSession.objects.create(external_user_id=101)
    VoiceSession.objects.create(external_user_id=202)

    assert events_for_user(101).count() == 1
    assert operations_for_user(101).count() == 1
    assert voice_sessions_for_user(101).count() == 1
