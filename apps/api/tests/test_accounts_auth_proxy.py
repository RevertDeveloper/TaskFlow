import pytest

from apps.authentication.infrastructure.accounts_auth_proxy import (
    AccountsAuthProxy,
    AccountsProxyError,
    AccountsProxyResponse,
)


def test_forwards_allowlisted_route_and_safe_headers() -> None:
    captured: dict[str, object] = {}

    def transport(url, method, body, headers, timeout):  # type: ignore[no-untyped-def]
        if url.endswith("/csrf/"):
            return AccountsProxyResponse(
                200,
                b'{"detail":"CSRF cookie set"}',
                "application/json",
                ("csrftoken=accounts-csrf; Path=/",),
            )
        captured.update(url=url, method=method, body=body, headers=headers, timeout=timeout)
        return AccountsProxyResponse(200, b'{"authenticated":true}', "application/json")

    result = AccountsAuthProxy(transport=transport).forward(
        "login",
        "POST",
        b'{"identifier":"user@example.com"}',
        {
            "Cookie": "sessionid=opaque; csrftoken=csrf",
            "Content-Type": "application/json",
            "X-CSRFToken": "csrf",
            "X-Service-Key": "must-not-forward",
            "Authorization": "Bearer must-not-forward",
        },
    )

    assert result.status_code == 200
    assert captured == {
        "url": "https://cuenta.carlosrevert.es/api/v1/auth/login/",
        "method": "POST",
        "body": b'{"identifier":"user@example.com"}',
        "headers": {
            "Accept": "application/json",
            "Cookie": "sessionid=opaque; csrftoken=accounts-csrf",
            "Content-Type": "application/json",
            "Referer": "https://cuenta.carlosrevert.es/",
            "X-CSRFToken": "accounts-csrf",
        },
        "timeout": 2.0,
    }


def test_does_not_return_accounts_csrf_cookie_to_browser() -> None:
    def transport(url, method, body, headers, timeout):  # type: ignore[no-untyped-def]
        if url.endswith("/csrf/"):
            return AccountsProxyResponse(
                200, b"{}", "application/json", ("csrftoken=secret; Path=/",)
            )
        return AccountsProxyResponse(
            204,
            b"",
            "application/json",
            ("sessionid=opaque; Path=/; HttpOnly", "csrftoken=secret; Path=/"),
        )

    response = AccountsAuthProxy(transport=transport).forward("logout", "POST", b"{}", {})

    assert response.set_cookie == ("sessionid=opaque; Path=/; HttpOnly",)


def test_rejects_unlisted_or_wrong_method_route() -> None:
    proxy = AccountsAuthProxy(transport=lambda *args: None)

    with pytest.raises(ValueError):
        proxy.forward("usage", "GET", b"", {})
    with pytest.raises(ValueError):
        proxy.forward("login", "GET", b"", {})


def test_redirect_is_not_followed() -> None:
    proxy = AccountsAuthProxy(
        transport=lambda *args: AccountsProxyResponse(
            302, b"", "text/html", ("Location: https://evil.test",)
        )
    )

    with pytest.raises(AccountsProxyError):
        proxy.forward("csrf", "GET", b"", {})


def test_referer_uses_configured_base_url_and_browser_csrf_is_ignored() -> None:
    captured: dict[str, str] = {}

    def transport(url, method, body, headers, timeout):  # type: ignore[no-untyped-def]
        if url.endswith("/csrf/"):
            return AccountsProxyResponse(
                200,
                b"{}",
                "application/json",
                ("csrftoken=upstream; Path=/",),
            )
        captured.update(headers)
        return AccountsProxyResponse(204, b"", "application/json")

    AccountsAuthProxy(base_url="https://accounts.test", transport=transport).forward(
        "logout",
        "POST",
        b"{}",
        {"X-CSRFToken": "browser-controlled", "Cookie": "sessionid=session"},
    )

    assert captured["Referer"] == "https://accounts.test/"
    assert captured["X-CSRFToken"] == "upstream"