from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from django.utils import timezone

from apps.ai.infrastructure.accounts_quota import FakeQuotaClient
from apps.ai.services.prompts import AvailableList
from apps.ai.services.task_extraction import ExtractedTaskDraft, TaskExtraction
from apps.common.exceptions import ResourceNotFound
from apps.voice.models import VoiceReviewDraft, VoiceSession
from apps.voice.services.routing import route_extraction

pytestmark = pytest.mark.django_db


INBOX_ID = UUID("11111111-1111-4111-8111-111111111111")
WORK_ID = UUID("22222222-2222-4222-8222-222222222222")


def test_routing_prioritizes_explicit_current_semantic_and_inbox(settings) -> None:
    settings.AI_CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.8
    extraction = TaskExtraction(
        schema_version=1,
        tasks=(
            ExtractedTaskDraft("Explícita", None, WORK_ID, "explicit", 0.1),
            ExtractedTaskDraft("Contexto", None, None, "current", 0.1),
            ExtractedTaskDraft("Semántica segura", None, WORK_ID, "semantic", 0.9),
            ExtractedTaskDraft("Semántica dudosa", None, WORK_ID, "semantic", 0.7),
            ExtractedTaskDraft("Ambigua", None, None, "ambiguous", 0.9),
        ),
        source={"kind": "voice_transcript"},
    )

    routed = route_extraction(
        extraction,
        available_lists=[AvailableList(INBOX_ID, "Inbox"), AvailableList(WORK_ID, "Trabajo")],
        inbox_id=INBOX_ID,
        current_list_id=WORK_ID,
    )

    assert [item.list_id for item in routed] == [WORK_ID, WORK_ID, WORK_ID, INBOX_ID, INBOX_ID]
    assert [item.routing for item in routed] == [
        "explicit",
        "current",
        "semantic",
        "inbox",
        "inbox",
    ]


def test_routing_never_uses_unavailable_or_archived_ids() -> None:
    extraction = TaskExtraction(
        schema_version=1,
        tasks=(ExtractedTaskDraft("Tarea", None, uuid4(), "semantic", 1.0),),
        source={"kind": "voice_transcript"},
    )
    routed = route_extraction(
        extraction,
        available_lists=[AvailableList(INBOX_ID, "Inbox")],
        inbox_id=INBOX_ID,
        current_list_id=None,
    )
    assert routed[0].list_id == INBOX_ID
    assert routed[0].routing == "inbox"


def test_confirmation_is_atomic_and_idempotent() -> None:
    from apps.lists.models import List
    from apps.voice.services.review import confirm_voice_tasks

    List.objects.create(id=INBOX_ID, external_user_id=101, name="Inbox", is_system=True)
    session = VoiceSession.objects.create(
        external_user_id=101,
        status=VoiceSession.Status.TRANSCRIBED,
        transcript="Comprar leche",
    )
    draft = VoiceReviewDraft.objects.create(
        external_user_id=101,
        session=session,
        payload={"schema_version": 1, "tasks": [], "source": {"kind": "voice_transcript"}},
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    key = uuid4()
    result = confirm_voice_tasks(
        101,
        draft.id,
        idempotency_key=key,
        tasks=[{"title": "Comprar leche", "description": "", "list_id": str(INBOX_ID)}],
    )
    repeated = confirm_voice_tasks(
        101,
        draft.id,
        idempotency_key=key,
        tasks=[{"title": "Ignorar", "description": "", "list_id": str(INBOX_ID)}],
    )

    assert len(result.tasks) == 1
    assert [task.id for task in repeated.tasks] == [result.tasks[0].id]
    assert VoiceReviewDraft.objects.get(id=draft.id).status == VoiceReviewDraft.Status.CONFIRMED
    assert VoiceSession.objects.get(id=session.id).transcript == ""


def test_confirmation_foreign_list_rolls_back() -> None:
    from apps.lists.models import List
    from apps.voice.services.review import confirm_voice_tasks

    List.objects.create(id=INBOX_ID, external_user_id=101, name="Inbox", is_system=True)
    session = VoiceSession.objects.create(
        external_user_id=101,
        status=VoiceSession.Status.TRANSCRIBED,
        transcript="Tarea",
    )
    draft = VoiceReviewDraft.objects.create(
        external_user_id=101,
        session=session,
        payload={"schema_version": 1, "tasks": [], "source": {"kind": "voice_transcript"}},
        expires_at=timezone.now() + timedelta(minutes=5),
    )

    with pytest.raises(ResourceNotFound):
        confirm_voice_tasks(
            101,
            draft.id,
            idempotency_key=uuid4(),
            tasks=[{"title": "No", "description": "", "list_id": str(WORK_ID)}],
        )

    assert draft.__class__.objects.get(id=draft.id).status == VoiceReviewDraft.Status.DRAFT
    from apps.tasks.models import Task

    assert Task.objects.count() == 0


def test_expired_draft_is_reused_and_confirmed_draft_is_idempotent(monkeypatch) -> None:
    from apps.lists.models import List
    from apps.voice.services.review import create_review_draft

    List.objects.create(id=INBOX_ID, external_user_id=101, name="Inbox", is_system=True)
    session = VoiceSession.objects.create(
        external_user_id=101,
        status=VoiceSession.Status.TRANSCRIBED,
        transcript="Comprar leche",
    )
    draft = VoiceReviewDraft.objects.create(
        external_user_id=101,
        session=session,
        payload={"old": True},
        expires_at=timezone.now() - timedelta(minutes=1),
    )
    monkeypatch.setattr(
        "apps.voice.services.review.extract_tasks",
        lambda **kwargs: TaskExtraction(
            schema_version=1,
            tasks=(ExtractedTaskDraft("Comprar leche", None, None, "inbox", 1.0),),
            source={"kind": "voice_transcript"},
        ),
    )
    regenerated = create_review_draft(
        101,
        session.id,
        current_list_id=None,
        request_headers={},
        quota=FakeQuotaClient(),
    )
    assert regenerated.id == draft.id
    assert regenerated.status == VoiceReviewDraft.Status.DRAFT

    regenerated.status = VoiceReviewDraft.Status.CONFIRMED
    regenerated.save(update_fields=["status", "updated_at"])
    assert create_review_draft(
        101,
        session.id,
        current_list_id=None,
        request_headers={},
        quota=FakeQuotaClient(),
    ).id == draft.id


def test_review_and_confirmation_endpoints_are_tenant_scoped(monkeypatch) -> None:
    from apps.lists.models import List
    from tests.test_api_resources import auth_client

    List.objects.create(id=INBOX_ID, external_user_id=101, name="Inbox", is_system=True)
    session = VoiceSession.objects.create(
        external_user_id=101,
        status=VoiceSession.Status.TRANSCRIBED,
        transcript="Comprar leche",
    )
    monkeypatch.setattr("apps.voice.api.get_ai_quota_client", lambda: FakeQuotaClient())
    monkeypatch.setattr(
        "apps.voice.services.review.extract_tasks",
        lambda **kwargs: TaskExtraction(
            schema_version=1,
            tasks=(ExtractedTaskDraft("Comprar leche", None, None, "inbox", 1.0),),
            source={"kind": "voice_transcript"},
        ),
    )
    client = auth_client(monkeypatch, "alice")
    response = client.post(
        f"/api/v1/voice/sessions/{session.id}/review/",
        data={},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=client.csrf_token,
    )
    assert response.status_code == 201
    draft_id = response.json()["data"]["id"]

    other = auth_client(monkeypatch, "bob")
    assert other.get(f"/api/v1/voice/sessions/{session.id}/review/").status_code == 404
    assert other.post(
        f"/api/v1/voice/reviews/{draft_id}/confirm/",
        data={"idempotency_key": str(uuid4()), "tasks": []},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=other.csrf_token,
    ).status_code == 422
