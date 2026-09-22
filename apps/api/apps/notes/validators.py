from collections.abc import Mapping
from typing import Any
from urllib.parse import urlparse

from django.core.exceptions import ValidationError

BLOCK_LIMIT = 2000
SPAN_KEYS = {"text", "format"}
FORMAT_KEYS = {"bold", "italic", "code", "highlight", "link"}
BLOCK_KEYS = {
    "paragraph": {"id", "type", "spans"},
    "heading": {"id", "type", "level", "spans", "collapsed"},
    "checklist": {"id", "type", "items", "autoSort"},
    "code": {"id", "type", "language", "text"},
    "divider": {"id", "type"},
}
ITEM_KEYS = {"id", "spans", "status", "completedAt", "indentLevel", "position", "children"}


def validate_blocks(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise ValidationError("blocks debe ser una lista.")
    if len(value) > BLOCK_LIMIT:
        raise ValidationError(f"blocks no puede contener más de {BLOCK_LIMIT} nodos.")
    for block in value:
        _validate_block(block)
    return value


def _validate_block(block: Any) -> None:
    if not isinstance(block, Mapping) or not isinstance(block.get("type"), str):
        raise ValidationError("Cada bloque debe ser un objeto con type.")
    block_type = block["type"]
    allowed = BLOCK_KEYS.get(block_type)
    if allowed is None or set(block) - allowed:
        raise ValidationError("El bloque contiene campos no permitidos.")
    _validate_uuid(block.get("id"), "id")
    if block_type == "paragraph":
        _validate_spans(block.get("spans"))
    elif block_type == "heading":
        _validate_spans(block.get("spans"))
        if block.get("level") not in {1, 2, 3}:
            raise ValidationError("El nivel del encabezado no es válido.")
    elif block_type == "checklist":
        if not isinstance(block.get("autoSort"), bool) or not isinstance(block.get("items"), list):
            raise ValidationError("La checklist requiere autoSort e items.")
        for item in block["items"]:
            _validate_item(item)
    elif block_type == "code":
        _validate_string(block.get("text"), "text", 200_000)
        if "language" in block and block["language"] is not None:
            _validate_string(block["language"], "language", 64)
    elif block_type == "divider":
        return
    if "collapsed" in block and not isinstance(block["collapsed"], bool):
        raise ValidationError("collapsed debe ser booleano.")


def _validate_item(item: Any) -> None:
    if not isinstance(item, Mapping) or set(item) - ITEM_KEYS:
        raise ValidationError("El ítem de checklist contiene campos no permitidos.")
    _validate_uuid(item.get("id"), "id")
    _validate_spans(item.get("spans"))
    if item.get("status") not in {"pending", "completed"}:
        raise ValidationError("El estado del ítem no es válido.")
    if item.get("completedAt") is not None and not isinstance(item.get("completedAt"), str):
        raise ValidationError("completedAt debe ser texto o null.")
    if not isinstance(item.get("indentLevel"), int) or isinstance(item.get("indentLevel"), bool) or not 0 <= item["indentLevel"] <= 4:
        raise ValidationError("indentLevel debe estar entre 0 y 4.")
    if not isinstance(item.get("position"), int) or isinstance(item.get("position"), bool) or item["position"] < 0:
        raise ValidationError("position debe ser un entero no negativo.")
    if not isinstance(item.get("children"), list):
        raise ValidationError("children debe ser una lista.")
    for child in item["children"]:
        _validate_item(child)


def _validate_spans(spans: Any) -> None:
    if not isinstance(spans, list):
        raise ValidationError("spans debe ser una lista.")
    for span in spans:
        if not isinstance(span, Mapping) or set(span) - SPAN_KEYS:
            raise ValidationError("El span contiene campos no permitidos.")
        _validate_string(span.get("text"), "text", 200_000)
        if "format" in span:
            _validate_format(span["format"])


def _validate_format(value: Any) -> None:
    if not isinstance(value, Mapping) or set(value) - FORMAT_KEYS:
        raise ValidationError("El formato inline contiene campos no permitidos.")
    for key in ("bold", "italic", "code"):
        if key in value and value[key] is not True:
            raise ValidationError(f"{key} debe ser true.")
    if "highlight" in value and value["highlight"] not in {"pink", "purple", "orange", "mint", "blue"}:
        raise ValidationError("El color de resaltado no es válido.")
    if "link" in value:
        _validate_url(value["link"])


def _validate_url(value: Any) -> None:
    if not isinstance(value, str) or urlparse(value).scheme not in {"http", "https"}:
        raise ValidationError("Los enlaces solo pueden usar http o https.")


def _validate_uuid(value: Any, field: str) -> None:
    import uuid

    try:
        uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise ValidationError(f"{field} debe ser un UUID válido.") from exc


def _validate_string(value: Any, field: str, maximum: int) -> None:
    if not isinstance(value, str) or len(value) > maximum:
        raise ValidationError(f"{field} no es válido.")
