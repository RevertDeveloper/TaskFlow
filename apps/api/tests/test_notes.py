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


def test_note_clean_removes_empty_checklist_items_and_legacy_blocks() -> None:
    note = Note(external_user_id=101, blocks=[
        {"id": str(uuid.uuid4()), "type": "divider"},
        {"id": str(uuid.uuid4()), "type": "checklist", "autoSort": True, "items": [
            {"id": str(uuid.uuid4()), "spans": [{"text": "  "}], "status": "pending",
             "completedAt": None, "indentLevel": 0, "position": 0, "children": []},
            {"id": str(uuid.uuid4()), "spans": [{"text": "Preparar demo"}], "status": "pending",
             "completedAt": None, "indentLevel": 0, "position": 1, "children": []},
        ]},
        {"id": str(uuid.uuid4()), "type": "checklist", "autoSort": True, "items": []},
    ])

    note.full_clean()

    assert len(note.blocks) == 1
    assert note.blocks[0]["items"][0]["spans"] == [{"text": "Preparar demo"}]
    assert note.blocks[0]["items"][0]["position"] == 0
