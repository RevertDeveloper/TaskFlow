import uuid

import pytest
from django.core.exceptions import ValidationError

from apps.notes.models import Note
from apps.notes.validators import validate_blocks

pytestmark = pytest.mark.django_db


def valid_blocks() -> list[dict[str, object]]:
    return [{"id": str(uuid.uuid4()), "type": "paragraph", "spans": [{"text": "Hola"}]}]


def test_validate_blocks_rejects_unsafe_links_and_unknown_fields() -> None:
    blocks = valid_blocks()
    blocks[0]["spans"] = [{"text": "x", "format": {"link": "javascript:alert(1)"}}]
    with pytest.raises(ValidationError):
        validate_blocks(blocks)

    blocks = valid_blocks()
    blocks[0]["unexpected"] = True
    with pytest.raises(ValidationError):
        validate_blocks(blocks)


def test_note_clean_validates_recursive_checklists() -> None:
    note = Note(external_user_id=101, blocks=[{
        "id": str(uuid.uuid4()), "type": "checklist", "autoSort": True, "items": [{
            "id": str(uuid.uuid4()), "spans": [{"text": "Tarea"}], "status": "pending",
            "completedAt": None, "indentLevel": 4, "position": 0, "children": [],
        }],
    }])
    note.full_clean()
    note.blocks[0]["items"][0]["indentLevel"] = 5
    with pytest.raises(ValidationError, match="indentLevel"):
        note.full_clean()
