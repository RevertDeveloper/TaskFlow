import base64
import json
from datetime import datetime
from uuid import UUID

from django.utils.dateparse import parse_datetime

from apps.lists.models import List
from apps.notes.models import Note
from apps.tasks.models import Task

ENTITY_ORDER = {"list": 0, "task": 1, "note": 2}


class InvalidSyncCursor(ValueError):
    """Raised when a client sends a cursor from another protocol version."""


def encode_cursor(updated_at: datetime, entity_type: str, entity_id: UUID) -> str:
    value = json.dumps(
        [updated_at.isoformat(), entity_type, str(entity_id)], separators=(",", ":")
    ).encode()
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def decode_cursor(value: str | None) -> tuple[datetime, str, UUID] | None:
    if not value:
        return None
    try:
        padded = value + "=" * (-len(value) % 4)
        timestamp, entity_type, entity_id = json.loads(base64.urlsafe_b64decode(padded))
        updated_at = parse_datetime(timestamp)
        if updated_at is None or entity_type not in ENTITY_ORDER:
            raise ValueError
        return updated_at, entity_type, UUID(entity_id)
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise InvalidSyncCursor("El cursor de sincronización no es válido.") from exc


def serialize_change(entity_type: str, entity: List | Task | Note) -> dict[str, object]:
    if entity_type == "list":
        assert isinstance(entity, List)
        deleted_at = entity.deleted_at
        data = {
            "id": str(entity.id),
            "name": entity.name,
            "description": entity.description,
            "emoji": entity.emoji,
            "color": entity.color,
            "position": entity.position,
            "is_archived": entity.is_archived,
            "is_system": entity.is_system,
            "created_at": entity.created_at.isoformat(),
            "updated_at": entity.updated_at.isoformat(),
            "deleted_at": deleted_at.isoformat() if deleted_at else None,
        }
    elif entity_type == "task":
        assert isinstance(entity, Task)
        deleted_at = entity.deleted_at
        data = {
            "id": str(entity.id),
            "list_id": str(entity.list_id),
            "title": entity.title,
            "description": entity.description,
            "status": entity.status,
            "source": entity.source,
            "position": entity.position,
            "completed_at": entity.completed_at.isoformat() if entity.completed_at else None,
            "created_at": entity.created_at.isoformat(),
            "updated_at": entity.updated_at.isoformat(),
            "deleted_at": deleted_at.isoformat() if deleted_at else None,
        }
    else:
        assert isinstance(entity, Note)
        deleted_at = entity.deleted_at
        data = {
            "id": str(entity.id),
            "folder_id": str(entity.folder_id) if entity.folder_id else None,
            "title": entity.title,
            "blocks": entity.blocks,
            "tags": entity.tags,
            "pinned": entity.pinned,
            "archived_at": entity.archived_at.isoformat() if entity.archived_at else None,
            "created_at": entity.created_at.isoformat(),
            "updated_at": entity.updated_at.isoformat(),
            "deleted_at": deleted_at.isoformat() if deleted_at else None,
        }
    return {
        "entity_type": entity_type,
        "entity_id": str(entity.id),
        "operation": "delete" if deleted_at else "upsert",
        "updated_at": entity.updated_at.isoformat(),
        "client_version": entity.sync_client_version or 0,
        "operation_id": str(entity.sync_operation_id) if entity.sync_operation_id else None,
        "data": data,
    }