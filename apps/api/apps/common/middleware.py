import json
import logging
import re
from contextvars import ContextVar
from datetime import UTC, datetime
from time import monotonic
from uuid import uuid4

from django.http import HttpRequest, HttpResponse

from .metrics import observe_http_request

_request_id_context: ContextVar[str | None] = ContextVar("taskflow_request_id", default=None)
_request_id_pattern = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
logger = logging.getLogger("taskflow.request")


def current_request_id() -> str | None:
    return _request_id_context.get()


def _request_id_from_header(value: str | None) -> str:
    if value and _request_id_pattern.fullmatch(value):
        return value
    return str(uuid4())


class RequestCorrelationMiddleware:
    def __init__(self, get_response) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        request_id = _request_id_from_header(request.headers.get("X-Request-ID"))
        token = _request_id_context.set(request_id)
        request.request_id = request_id
        started_at = monotonic()

        try:
            response = self.get_response(request)
        except Exception:
            logger.exception(
                "request_failed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.path,
                    "status_code": 500,
                    "duration_ms": round((monotonic() - started_at) * 1000, 2),
                },
            )
            raise
        else:
            observe_http_request(request, response.status_code, started_at)
            response["X-Request-ID"] = request_id
            logger.info(
                "request_completed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.path,
                    "status_code": response.status_code,
                    "duration_ms": round((monotonic() - started_at) * 1000, 2),
                },
            )
            return response
        finally:
            _request_id_context.reset(token)


class RequestIdLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = current_request_id()
        return True


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname.lower(),
            "event": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None)
        if request_id:
            payload["request_id"] = request_id
        for field in (
            "method",
            "path",
            "status_code",
            "duration_ms",
            "external_user_id_hash",
            "voice_session_id",
            "sync_id",
            "operation_id",
            "provider",
            "provider_latency_ms",
            "error_code",
            "result",
            "accepted_count",
            "conflict_count",
        ):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=True)