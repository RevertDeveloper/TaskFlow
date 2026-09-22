from uuid import UUID

from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework.exceptions import NotFound

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.common.api import TaskFlowAPIView, success_response

from .models import Note
from .permissions import CanAccessNotes
from .serializers import NotePayloadSerializer


@extend_schema_view(
    post=extend_schema(operation_id="notes_create", request=NotePayloadSerializer),
)
class NoteCollectionView(TaskFlowAPIView):
    permission_classes = (CanAccessNotes,)

    def get(self, request):
        notes = Note.objects.filter(external_user_id=_external_user_id(request), deleted_at__isnull=True)
        return success_response([_serialize(note) for note in notes])

    def post(self, request):
        serializer = NotePayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = Note(external_user_id=_external_user_id(request), **serializer.validated_data)
        note.full_clean()
        note.save()
        return success_response(_serialize(note), status_code=201)


@extend_schema_view(
    patch=extend_schema(operation_id="notes_partial_update", request=NotePayloadSerializer),
)
class NoteDetailView(TaskFlowAPIView):
    permission_classes = (CanAccessNotes,)

    def patch(self, request, note_id: str):
        serializer = NotePayloadSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        note = self._get_note(request, note_id)
        for field, value in serializer.validated_data.items():
            setattr(note, field, value)
        note.updated_at = timezone.now()
        note.full_clean()
        note.save()
        return success_response(_serialize(note))

    def _get_note(self, request, note_id: str) -> Note:
        try:
            note_uuid = UUID(note_id)
        except ValueError as exc:
            raise NotFound("Note not found") from exc
        try:
            return Note.objects.get(id=note_uuid, external_user_id=_external_user_id(request), deleted_at__isnull=True)
        except Note.DoesNotExist as exc:
            raise NotFound("Note not found") from exc


def _external_user_id(request) -> int:
    principal = request.user
    if not isinstance(principal, AuthenticatedPrincipal):
        raise NotFound("Note not found")
    return principal.external_user_id


def _serialize(note: Note) -> dict[str, object]:
    return {
        "id": str(note.id),
        "folder_id": str(note.folder_id) if note.folder_id else None,
        "title": note.title,
        "blocks": note.blocks,
        "tags": note.tags,
        "pinned": note.pinned,
        "archived_at": note.archived_at.isoformat() if note.archived_at else None,
        "deleted_at": note.deleted_at.isoformat() if note.deleted_at else None,
        "created_at": note.created_at.isoformat(),
        "updated_at": note.updated_at.isoformat(),
    }
