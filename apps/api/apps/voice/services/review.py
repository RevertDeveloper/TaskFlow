import json
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError as SchemaValidationError

from apps.ai.domain.ports import AIQuotaClient
from apps.ai.services.prompts import AvailableList
from apps.ai.services.task_extraction import extract_tasks
from apps.lists.models import List
from apps.lists.selectors import get_owned_list
from apps.lists.services.ensure_inbox import ensure_inbox_for_user
from apps.tasks.models import Task
from apps.tasks.services.create_task import create_task

from ..models import VoiceReviewDraft, VoiceSession
from .routing import RoutedTaskDraft, route_extraction

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "schemas" / "review_draft.schema.json"
SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FormatChecker())


@dataclass(frozen=True, slots=True)
class ConfirmedVoiceTasks:
    draft: VoiceReviewDraft
    tasks: tuple[Task, ...]


def create_review_draft(
    external_user_id: int,
    session_id: UUID,
    *,
    current_list_id: UUID | None,
    request_headers: Any,
    quota: AIQuotaClient,
) -> VoiceReviewDraft:
    with transaction.atomic():
        session = _get_owned_session(external_user_id, session_id, lock=True)
        if session.status != VoiceSession.Status.TRANSCRIBED or not session.transcript.strip():
            raise ValidationError(
                {"session": "La sesión todavía no tiene una transcripción revisable."}
            )

        existing = VoiceReviewDraft.objects.select_for_update().filter(
            session=session,
            external_user_id=external_user_id,
        ).first()
        now = timezone.now()
        if existing and existing.status == VoiceReviewDraft.Status.DRAFT:
            if existing.expires_at > now:
                return existing
            existing.status = VoiceReviewDraft.Status.EXPIRED
            existing.save(update_fields=["status", "updated_at"])
        if existing and existing.status == VoiceReviewDraft.Status.CONFIRMED:
            return existing

        inbox = ensure_inbox_for_user(external_user_id)
        available_queryset = List.objects.filter(
            external_user_id=external_user_id,
            deleted_at__isnull=True,
            is_archived=False,
        ).order_by("position", "created_at", "id")
        available_lists = [AvailableList(item.id, item.name) for item in available_queryset]
        active_current_id = _active_current_list_id(
            external_user_id,
            current_list_id,
            available_queryset,
        )
        extraction = extract_tasks(
            transcript=session.transcript,
            available_lists=available_lists,
            current_list_id=active_current_id,
            quota=quota,
            request_headers=request_headers,
            request_id=uuid4(),
        )
        routed_tasks = route_extraction(
            extraction,
            available_lists=available_lists,
            inbox_id=inbox.id,
            current_list_id=active_current_id,
        )
        payload = _draft_payload(extraction.source, routed_tasks)
        _validate_payload(payload)
        if existing:
            existing.status = VoiceReviewDraft.Status.DRAFT
            existing.schema_version = 1
            existing.payload = payload
            existing.expires_at = now + timedelta(seconds=_draft_ttl_seconds())
            existing.confirmation_key = None
            existing.confirmed_task_ids = []
            existing.confirmed_at = None
            existing.save(
                update_fields=[
                    "status",
                    "schema_version",
                    "payload",
                    "expires_at",
                    "confirmation_key",
                    "confirmed_task_ids",
                    "confirmed_at",
                    "updated_at",
                ]
            )
            return existing
        return VoiceReviewDraft.objects.create(
            external_user_id=external_user_id,
            session=session,
            schema_version=1,
            payload=payload,
            expires_at=now + timedelta(seconds=_draft_ttl_seconds()),
        )


def confirm_voice_tasks(
    external_user_id: int,
    draft_id: UUID,
    *,
    idempotency_key: UUID,
    tasks: list[dict[str, Any]],
) -> ConfirmedVoiceTasks:
    with transaction.atomic():
        try:
            draft = VoiceReviewDraft.objects.select_for_update().select_related("session").get(
                id=draft_id,
                external_user_id=external_user_id,
                session__external_user_id=external_user_id,
            )
        except VoiceReviewDraft.DoesNotExist as exc:
            raise ValidationError({"draft": "El borrador de voz no existe."}) from exc

        if draft.status == VoiceReviewDraft.Status.CONFIRMED:
            if draft.confirmation_key != idempotency_key:
                raise ValidationError({"idempotency_key": "El borrador ya fue confirmado."})
            return ConfirmedVoiceTasks(
                draft=draft,
                tasks=tuple(
                    Task.objects.filter(
                        id__in=draft.confirmed_task_ids,
                        external_user_id=external_user_id,
                    ).order_by("created_at", "id")
                ),
            )
        if draft.status != VoiceReviewDraft.Status.DRAFT or draft.expires_at <= timezone.now():
            if draft.status == VoiceReviewDraft.Status.DRAFT:
                draft.status = VoiceReviewDraft.Status.EXPIRED
                draft.save(update_fields=["status", "updated_at"])
            raise ValidationError({"draft": "El borrador de voz ha caducado."})

        created_tasks: list[Task] = []
        for item in tasks:
            list_id = UUID(str(item["list_id"]))
            get_owned_list(external_user_id, list_id)
            created_tasks.append(
                create_task(
                    external_user_id,
                    list_id=list_id,
                    title=str(item["title"]).strip(),
                    description=str(item.get("description") or "").strip(),
                    source=Task.Source.AI,
                )
            )

        draft.status = VoiceReviewDraft.Status.CONFIRMED
        draft.confirmation_key = idempotency_key
        draft.confirmed_task_ids = [str(task.id) for task in created_tasks]
        draft.confirmed_at = timezone.now()
        draft.save(
            update_fields=[
                "status",
                "confirmation_key",
                "confirmed_task_ids",
                "confirmed_at",
                "updated_at",
            ]
        )
        session = draft.session
        if not session.transcript_retention:
            session.transcript = ""
            session.save(update_fields=["transcript", "updated_at"])
        return ConfirmedVoiceTasks(draft=draft, tasks=tuple(created_tasks))


def _get_owned_session(external_user_id: int, session_id: UUID, *, lock: bool) -> VoiceSession:
    queryset = VoiceSession.objects
    if lock:
        queryset = queryset.select_for_update()
    try:
        return queryset.get(id=session_id, external_user_id=external_user_id)
    except VoiceSession.DoesNotExist as exc:
        raise ValidationError({"session": "La sesión de voz no existe."}) from exc


def _active_current_list_id(
    external_user_id: int,
    current_list_id: UUID | None,
    available_queryset,
) -> UUID | None:
    if current_list_id is None:
        return None
    if not available_queryset.filter(id=current_list_id).exists():
        raise ValidationError({"current_list_id": "La lista actual no está disponible."})
    return current_list_id


def _draft_payload(source: dict[str, str], tasks: tuple[RoutedTaskDraft, ...]) -> dict[str, object]:
    return {
        "schema_version": 1,
        "tasks": [
            {
                "title": task.title,
                "description": task.description,
                "list_id": str(task.list_id),
                "classification_hint": task.classification_hint,
                "confidence": task.confidence,
                "routing": task.routing,
            }
            for task in tasks
        ],
        "source": dict(source),
    }


def _validate_payload(payload: dict[str, object]) -> None:
    try:
        VALIDATOR.validate(payload)
    except SchemaValidationError as exc:
        raise ValidationError({"draft": "El borrador generado no cumple el contrato."}) from exc


def _draft_ttl_seconds() -> int:
    return max(60, int(getattr(settings, "AI_REVIEW_DRAFT_TTL_SECONDS", 1800)))
