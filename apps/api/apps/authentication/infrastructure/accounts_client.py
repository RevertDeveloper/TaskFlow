import json
import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import BaseHandler, Request, build_opener

from ..domain.models import AuthenticatedPrincipal, IdentityPayloadError, normalize_account_user


class AccountsClientError(RuntimeError):
    """Base error for failures while validating an Accounts session."""


class AccountsUnavailableError(AccountsClientError):
    """Accounts could not validate the session."""


class AccountsMalformedResponseError(AccountsClientError):
    """Accounts returned a response outside its documented contract."""


@dataclass(frozen=True, slots=True)
class AccountsHttpResponse:
    status_code: int
    body: bytes
    location: str | None = None


Transport = Callable[[str, Mapping[str, str], float], AccountsHttpResponse]


class AccountsSessionClient:
    """Server-side client for the request-time Accounts `/auth/me/` check."""

    def __init__(
        self,
        base_url: str | None = None,
        timeout_seconds: float | None = None,
        transport: Transport | None = None,
    ) -> None:
        configured_url = base_url or os.getenv("ACCOUNTS_BASE_URL", "https://cuenta.carlosrevert.es")
        self.base_url = _validated_base_url(configured_url)
        self.timeout_seconds = timeout_seconds or float(
            os.getenv("ACCOUNTS_TIMEOUT_SECONDS", "2")
        )
        if self.timeout_seconds <= 0:
            raise ValueError("Accounts timeout must be positive")
        self._transport = transport or _urllib_transport

    def get_current_user(
        self, request_headers: Mapping[str, str]
    ) -> AuthenticatedPrincipal | None:
        cookie = _incoming_cookie(request_headers)
        headers = {"Accept": "application/json"}
        if cookie:
            headers["Cookie"] = cookie

        try:
            response = self._transport(
                urljoin(self.base_url, "api/v1/auth/me/"), headers, self.timeout_seconds
            )
        except (TimeoutError, URLError, OSError) as exc:
            raise AccountsUnavailableError("Accounts session validation unavailable") from exc

        if response.location:
            raise AccountsMalformedResponseError("Accounts session validation redirected")
        if response.status_code != 200:
            raise AccountsUnavailableError("Accounts session validation failed")

        try:
            payload = json.loads(response.body)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise AccountsMalformedResponseError("Accounts response was not valid JSON") from exc

        if not isinstance(payload, dict) or not isinstance(payload.get("authenticated"), bool):
            raise AccountsMalformedResponseError("Accounts response has an invalid shape")
        if not payload["authenticated"]:
            if payload.get("user") is not None:
                raise AccountsMalformedResponseError("Anonymous Accounts response has a user")
            return None

        try:
            return normalize_account_user(payload.get("user"))
        except IdentityPayloadError as exc:
            raise AccountsMalformedResponseError("Accounts user payload was invalid") from exc


def _incoming_cookie(request_headers: Mapping[str, str]) -> str | None:
    for name, value in request_headers.items():
        if name.lower() == "cookie":
            return value.strip() or None
    return None


def _validated_base_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Accounts base URL must be an absolute HTTP(S) URL")
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1"}:
        raise ValueError("Accounts base URL must use HTTPS outside local development")
    return value.rstrip("/") + "/"


def _urllib_transport(
    url: str, headers: Mapping[str, str], timeout_seconds: float
) -> AccountsHttpResponse:
    request = Request(url, headers=dict(headers), method="GET")
    opener = build_opener(_NoRedirectHandler)
    try:
        with opener.open(request, timeout=timeout_seconds) as response:
            return AccountsHttpResponse(
                status_code=response.status,
                body=response.read(),
                location=response.headers.get("Location"),
            )
    except HTTPError as exc:
        return AccountsHttpResponse(
            status_code=exc.code,
            body=exc.read(),
            location=exc.headers.get("Location"),
        )


class _NoRedirectHandler(BaseHandler):
    def redirect_request(self, request, response, code, msg, headers, new_url):  # type: ignore[no-untyped-def]
        return None