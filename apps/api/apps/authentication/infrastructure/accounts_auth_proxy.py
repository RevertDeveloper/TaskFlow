import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from http.cookies import SimpleCookie
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, build_opener

from .accounts_client import _NoRedirectHandler, _validated_base_url


class AccountsProxyError(RuntimeError):
    """Raised when the Accounts auth proxy cannot reach its upstream."""


@dataclass(frozen=True, slots=True)
class AccountsProxyResponse:
    status_code: int
    body: bytes
    content_type: str
    set_cookie: tuple[str, ...] = ()


ProxyTransport = Callable[
    [str, str, bytes, Mapping[str, str], float], AccountsProxyResponse
]


class AccountsAuthProxy:
    """Allowlisted server-side proxy for the browser-facing Accounts auth flow."""

    ALLOWED_ROUTES = {
        "csrf": ("GET", "api/v1/auth/csrf/"),
        "login": ("POST", "api/v1/auth/login/"),
        "logout": ("POST", "api/v1/auth/logout/"),
        "register": ("POST", "api/v1/auth/register/"),
        "verify-email": ("POST", "api/v1/auth/verify-email/"),
        "verify-email-resend": ("POST", "api/v1/auth/verify-email/resend/"),
    }

    def __init__(
        self,
        base_url: str | None = None,
        timeout_seconds: float | None = None,
        transport: ProxyTransport | None = None,
    ) -> None:
        configured_url = (
            base_url
            if base_url is not None
            else os.getenv("ACCOUNTS_BASE_URL") or "https://cuenta.carlosrevert.es"
        )
        self.base_url = _validated_base_url(configured_url)
        self.timeout_seconds = timeout_seconds or float(
            os.getenv("ACCOUNTS_TIMEOUT_SECONDS", "2")
        )
        if self.timeout_seconds <= 0:
            raise ValueError("Accounts timeout must be positive")
        self._transport = transport or _urllib_proxy_transport

    def forward(
        self,
        route: str,
        method: str,
        body: bytes,
        request_headers: Mapping[str, str],
    ) -> AccountsProxyResponse:
        allowed = self.ALLOWED_ROUTES.get(route)
        if allowed is None or allowed[0] != method:
            raise ValueError("Unsupported Accounts auth proxy route")
        headers = _proxy_headers(request_headers, referer=self.base_url)
        try:
            if method == "POST":
                csrf_response = self._transport(
                    urljoin(self.base_url, self.ALLOWED_ROUTES["csrf"][1]),
                    "GET",
                    b"",
                    headers,
                    self.timeout_seconds,
                )
                csrf_cookie = _csrf_cookie(csrf_response.set_cookie)
                if csrf_response.status_code != 200 or csrf_cookie is None:
                    raise AccountsProxyError("Accounts auth proxy CSRF unavailable")
                headers["Cookie"] = _join_session_and_csrf_cookie(
                    headers.get("Cookie"), csrf_cookie
                )
                headers["X-CSRFToken"] = csrf_cookie
            response = self._transport(
                urljoin(self.base_url, allowed[1]),
                method,
                body,
                headers,
                self.timeout_seconds,
            )
        except (TimeoutError, URLError, OSError) as exc:
            raise AccountsProxyError("Accounts auth proxy unavailable") from exc
        if response.status_code in {301, 302, 303, 307, 308}:
            raise AccountsProxyError("Accounts auth proxy rejected a redirect")
        return AccountsProxyResponse(
            status_code=response.status_code,
            body=response.body,
            content_type=response.content_type,
            set_cookie=tuple(
                cookie for cookie in response.set_cookie if not _is_csrf_cookie(cookie)
            ),
        )


def _proxy_headers(
    request_headers: Mapping[str, str], *, referer: str
) -> dict[str, str]:
    headers = {"Accept": "application/json", "Referer": referer}
    for name, value in request_headers.items():
        lowered = name.lower()
        if lowered == "cookie":
            session_cookie = _session_cookie(value)
            if session_cookie:
                headers["Cookie"] = session_cookie
        elif lowered == "content-type":
            headers["Content-Type"] = value
    return headers


def _session_cookie(cookie_header: str) -> str | None:
    cookies = SimpleCookie()
    cookies.load(cookie_header)
    session = cookies.get("sessionid")
    return f"sessionid={session.value}" if session else None


def _csrf_cookie(set_cookies: tuple[str, ...]) -> str | None:
    for set_cookie in set_cookies:
        cookies = SimpleCookie()
        cookies.load(set_cookie)
        csrf = cookies.get("csrftoken")
        if csrf:
            return csrf.value
    return None


def _join_session_and_csrf_cookie(session_cookie: str | None, csrf_token: str) -> str:
    return "; ".join(part for part in (session_cookie, f"csrftoken={csrf_token}") if part)


def _is_csrf_cookie(set_cookie: str) -> bool:
    cookies = SimpleCookie()
    cookies.load(set_cookie)
    return "csrftoken" in cookies


def _urllib_proxy_transport(
    url: str,
    method: str,
    body: bytes,
    headers: Mapping[str, str],
    timeout_seconds: float,
) -> AccountsProxyResponse:
    request = Request(url, data=body or None, headers=dict(headers), method=method)
    opener = build_opener(_NoRedirectHandler())
    try:
        with opener.open(request, timeout=timeout_seconds) as response:
            return _response_from_http(response)
    except HTTPError as exc:
        return _response_from_http(exc)


def _response_from_http(response) -> AccountsProxyResponse:
    set_cookie = tuple(response.headers.get_all("Set-Cookie", []))
    return AccountsProxyResponse(
        status_code=response.status,
        body=response.read(),
        content_type=response.headers.get_content_type(),
        set_cookie=set_cookie,
    )