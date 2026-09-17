import json
import os
import re
from collections.abc import Callable, Mapping
from http.cookies import SimpleCookie
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import BaseHandler, Request, build_opener
from uuid import UUID

from apps.ai.domain.ports import (
    AIQuotaClient,
    AIQuotaConfigurationError,
    AIQuotaRejected,
    AIQuotaUnavailable,
    QuotaReservation,
)

SAFE_ERROR_CODE = re.compile(r"^[A-Za-z0-9_.:-]{1,80}$")
FORBIDDEN_METADATA_KEYS = {
    "audio",
    "content",
    "input",
    "message",
    "output",
    "prompt",
    "prompts",
    "response",
    "responses",
    "transcript",
}


class AccountsQuotaResponse:
    def __init__(self, status_code: int, body: bytes, headers: Mapping[str, str] | None = None):
        self.status_code = status_code
        self.body = body
        self.headers = dict(headers or {})


QuotaTransport = Callable[
    [str, str, Mapping[str, str], bytes | None, float], AccountsQuotaResponse
]


class AccountsQuotaClient(AIQuotaClient):
    """Server-side adapter for the documented Accounts quota contract."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        application_slug: str | None = None,
        service_key: str | None = None,
        timeout_seconds: float | None = None,
        transport: QuotaTransport | None = None,
    ) -> None:
        configured_url = (
            base_url
            or os.getenv("ACCOUNTS_BASE_URL")
            or "https://cuenta.carlosrevert.es"
        )
        self.base_url = _validated_base_url(configured_url)
        self.application_slug = (
            application_slug or os.getenv("ACCOUNTS_APPLICATION_SLUG") or "taskflow"
        )
        self.service_key = service_key or os.getenv("ACCOUNTS_TASKFLOW_SERVICE_KEY") or ""
        self.timeout_seconds = timeout_seconds or float(
            os.getenv("ACCOUNTS_TIMEOUT_SECONDS", "2")
        )
        if self.timeout_seconds <= 0 or not self.application_slug:
            raise ValueError("Accounts quota client configuration is invalid")
        self._transport = transport or _urllib_transport

    def reserve(
        self,
        *,
        request_headers: Mapping[str, str],
        action: str,
        request_id: UUID,
    ) -> QuotaReservation:
        session_cookie = _incoming_header(request_headers, "cookie")
        if not session_cookie:
            raise AIQuotaRejected("authentication_required")

        csrf_cookie, csrf_token = self._get_csrf(session_cookie)
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Cookie": f"{session_cookie}; {csrf_cookie}",
            "X-CSRFToken": csrf_token,
        }
        payload = {
            "application": self.application_slug,
            "action": _validated_action(action),
            "request_id": str(request_id),
        }
        response = self._request("POST", "api/v1/usage/reserve/", headers, payload)
        body = _json_object(response)
        if response.status_code != 200:
            raise AIQuotaRejected(_safe_code(body.get("code"), "quota_rejected"))
        if body.get("authorized") is not True or body.get("request_id") != str(request_id):
            raise AIQuotaRejected(_safe_code(body.get("code"), "reservation_rejected"))
        return QuotaReservation(request_id=request_id)

    def validate(self, *, request_id: UUID, action: str) -> None:
        body = self._internal_post(
            "api/v1/internal/usage/validate/",
            {
                "request_id": str(request_id),
                "application": self.application_slug,
                "action": _validated_action(action),
            },
        )
        if (
            body.get("valid") is not True
            or body.get("request_id") != str(request_id)
            or body.get("application") != self.application_slug
            or body.get("action") != action
        ):
            raise AIQuotaRejected(_safe_code(body.get("code"), "reservation_invalid"))

    def complete(
        self,
        *,
        request_id: UUID,
        metadata: Mapping[str, object] | None = None,
        processing_time_ms: int | None = None,
    ) -> None:
        payload: dict[str, object] = {"metadata": _safe_metadata(metadata)}
        if processing_time_ms is not None:
            payload["processing_time_ms"] = max(0, processing_time_ms)
        self._internal_post(f"api/v1/usage/{request_id}/complete/", payload)

    def fail(
        self,
        *,
        request_id: UUID,
        error_code: str,
        metadata: Mapping[str, object] | None = None,
    ) -> None:
        payload = {
            "error_code": _validated_action(error_code),
            "metadata": _safe_metadata(metadata),
        }
        self._internal_post(f"api/v1/usage/{request_id}/fail/", payload)

    def _get_csrf(self, session_cookie: str) -> tuple[str, str]:
        response = self._request(
            "GET",
            "api/v1/auth/csrf/",
            {"Accept": "application/json", "Cookie": session_cookie},
            None,
        )
        if response.status_code != 200:
            raise AIQuotaUnavailable("csrf_unavailable")
        set_cookie = _header(response.headers, "set-cookie")
        cookie = SimpleCookie()
        cookie.load(set_cookie)
        csrf = cookie.get("csrftoken")
        if csrf is None or not csrf.value:
            raise AIQuotaUnavailable("csrf_unavailable")
        return f"csrftoken={csrf.value}", csrf.value

    def _internal_post(self, path: str, payload: Mapping[str, object]) -> dict[str, object]:
        if not self.service_key:
            raise AIQuotaConfigurationError("service_key_missing")
        response = self._request(
            "POST",
            path,
            {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Application-Slug": self.application_slug,
                "X-Service-Key": self.service_key,
            },
            payload,
        )
        body = _json_object(response)
        if response.status_code != 200:
            raise AIQuotaUnavailable("accounts_callback_failed")
        return body

    def _request(
        self,
        method: str,
        path: str,
        headers: Mapping[str, str],
        payload: Mapping[str, object] | None,
    ) -> AccountsQuotaResponse:
        body = json.dumps(payload, separators=(",", ":")).encode() if payload is not None else None
        try:
            response = self._transport(
                method,
                urljoin(self.base_url, path),
                headers,
                body,
                self.timeout_seconds,
            )
        except (TimeoutError, URLError, OSError) as exc:
            raise AIQuotaUnavailable("accounts_unavailable") from exc
        if response.headers.get("Location"):
            raise AIQuotaUnavailable("accounts_redirected")
        return response


class FakeQuotaClient(AIQuotaClient):
    """Deterministic quota double for tests and local contract harnesses."""

    def __init__(self) -> None:
        self.reservations: dict[UUID, str] = {}
        self.completed: set[UUID] = set()
        self.failed: dict[UUID, str] = {}

    def reserve(
        self,
        *,
        request_headers: Mapping[str, str],
        action: str,
        request_id: UUID,
    ) -> QuotaReservation:
        if request_id in self.completed or request_id in self.failed:
            raise AIQuotaRejected("request_already_used")
        existing = self.reservations.get(request_id)
        if existing is not None and existing != action:
            raise AIQuotaRejected("request_id_conflict")
        self.reservations[request_id] = action
        return QuotaReservation(request_id=request_id)

    def validate(self, *, request_id: UUID, action: str) -> None:
        if self.reservations.get(request_id) != action:
            raise AIQuotaRejected("reservation_invalid")
        if request_id in self.completed or request_id in self.failed:
            raise AIQuotaRejected("request_already_used")
        self.reservations[request_id] = f"processing:{action}"

    def complete(
        self,
        *,
        request_id: UUID,
        metadata: Mapping[str, object] | None = None,
        processing_time_ms: int | None = None,
    ) -> None:
        if request_id in self.completed or request_id in self.failed:
            return
        if not self.reservations.get(request_id, "").startswith("processing:"):
            raise AIQuotaRejected("reservation_invalid")
        self.completed.add(request_id)

    def fail(
        self,
        *,
        request_id: UUID,
        error_code: str,
        metadata: Mapping[str, object] | None = None,
    ) -> None:
        if request_id in self.completed or request_id in self.failed:
            return
        if not self.reservations.get(request_id, "").startswith("processing:"):
            raise AIQuotaRejected("reservation_invalid")
        self.failed[request_id] = error_code


def _validated_action(value: str) -> str:
    if not SAFE_ERROR_CODE.fullmatch(value):
        raise ValueError("Quota action or error code is invalid")
    return value


def _safe_metadata(metadata: Mapping[str, object] | None) -> dict[str, object]:
    if not metadata:
        return {}
    safe = {
        str(key): value
        for key, value in metadata.items()
        if str(key).lower() not in FORBIDDEN_METADATA_KEYS
    }
    try:
        encoded = json.dumps(safe, separators=(",", ":"))
    except (TypeError, ValueError):
        return {"metadata_invalid": True}
    return safe if len(encoded) <= 2048 else {"metadata_truncated": True}


def _json_object(response: AccountsQuotaResponse) -> dict[str, object]:
    try:
        payload = json.loads(response.body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AIQuotaUnavailable("accounts_malformed_response") from exc
    if not isinstance(payload, dict):
        raise AIQuotaUnavailable("accounts_malformed_response")
    return payload


def _safe_code(value: object, fallback: str) -> str:
    return value if isinstance(value, str) and SAFE_ERROR_CODE.fullmatch(value) else fallback


def _incoming_header(headers: Mapping[str, str], name: str) -> str | None:
    for key, value in headers.items():
        if key.lower() == name:
            return value.strip() or None
    return None


def _header(headers: Mapping[str, str], name: str) -> str:
    return _incoming_header(headers, name) or ""


def _validated_base_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Accounts base URL must be an absolute HTTP(S) URL")
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1"}:
        raise ValueError("Accounts base URL must use HTTPS outside local development")
    return value.rstrip("/") + "/"


def _urllib_transport(
    method: str,
    url: str,
    headers: Mapping[str, str],
    body: bytes | None,
    timeout_seconds: float,
) -> AccountsQuotaResponse:
    request = Request(url, data=body, headers=dict(headers), method=method)
    opener = build_opener(_NoRedirectHandler)
    try:
        with opener.open(request, timeout=timeout_seconds) as response:
            return AccountsQuotaResponse(
                response.status,
                response.read(),
                {key: value for key, value in response.headers.items()},
            )
    except HTTPError as exc:
        return AccountsQuotaResponse(
            exc.code,
            exc.read(),
            {key: value for key, value in exc.headers.items()},
        )


class _NoRedirectHandler(BaseHandler):
    def redirect_request(self, request, response, code, msg, headers, new_url):
        return None