import uuid

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.notes.api import NoteCollectionView

pytestmark = pytest.mark.django_db


def test_note_payload_validation_returns_http_400_for_malformed_blocks() -> None:
    factory = APIRequestFactory()
    request = factory.post("/api/v1/notes/", {"blocks": [{"type": "html"}], "folder_id": None}, format="json")
    force_authenticate(request, user=AuthenticatedPrincipal(101, "user@example.com", "user", "User", None, True))
    response = NoteCollectionView.as_view()(request)
    assert response.status_code == 400


def test_note_payload_validation_accepts_structured_paragraph() -> None:
    factory = APIRequestFactory()
    request = factory.post("/api/v1/notes/", {
        "blocks": [{"id": str(uuid.uuid4()), "type": "paragraph", "spans": [{"text": "Hola"}]}],
        "folder_id": None,
    }, format="json")
    force_authenticate(request, user=AuthenticatedPrincipal(101, "user@example.com", "user", "User", None, True))
    response = NoteCollectionView.as_view()(request)
    assert response.status_code == 201
