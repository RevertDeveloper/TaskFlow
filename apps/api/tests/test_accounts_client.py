import json

import pytest

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.authentication.infrastructure.accounts_client import (
    AccountsHttpResponse,
    AccountsMalformedResponseError,
    AccountsSessionClient,
    AccountsUnavailableError,
)


def response(
    payload: object, status_code: int = 200, location: str | None = None
) -> AccountsHttpResponse:
    return AccountsHttpResponse(status_code, json.dumps(payload).encode(), location)


def test_forwards_only_the_incoming_cookie_and_normalizes_user() -> None:
    captured: dict[str, object] = {}

    def transport(url, headers, timeout):  # type: ignore[no-untyped-def]
        captured.update(url=url, headers=headers, timeout=timeout)
        return response(
            {
                "authenticated": True,
                "user": {
                    "id": 123,
                    "username": "example",
                    "email": "user@example.com",
                    "email_verified": True,
                    "first_name": "Ada",
                    "last_name": "Lovelace",
                    "plan": "FREE",
                },
            }
        )

    principal = AccountsSessionClient(
        base_url="https://cuenta.carlosrevert.es", transport=transport
    ).get_current_user(
        {"Cookie": "sessionid=secret", "X-User-Id": "999", "Authorization": "Bearer fake"}
    )

    assert principal == AuthenticatedPrincipal(
        external_user_id=123,
        email="user@example.com",
        username="example",
        display_name="Ada Lovelace",
        plan="FREE",
        email_verified=True,
    )
    assert captured == {
        "url": "https://cuenta.carlosrevert.es/api/v1/auth/me/",
        "headers": {"Accept": "application/json", "Cookie": "sessionid=secret"},
        "timeout": 2.0,
    }


def test_anonymous_response_returns_no_principal() -> None:
    client = AccountsSessionClient(
        base_url="https://cuenta.carlosrevert.es",
        transport=lambda url, headers, timeout: response(
            {"authenticated": False, "user": None}
        ),
    )

    assert client.get_current_user({}) is None


@pytest.mark.parametrize(
    "transport",
    [
        lambda url, headers, timeout: response({"authenticated": True, "user": None}),
        lambda url, headers, timeout: response({"authenticated": False, "user": {}}),
        lambda url, headers, timeout: response({"authenticated": True}, status_code=200),
        lambda url, headers, timeout: response({}, status_code=302, location="https://evil.test"),
    ],
)
def test_rejects_malformed_or_redirected_accounts_responses(transport) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(AccountsMalformedResponseError):
        AccountsSessionClient(
            base_url="https://cuenta.carlosrevert.es", transport=transport
        ).get_current_user({})


def test_upstream_failure_is_fail_closed() -> None:
    def transport(url, headers, timeout):  # type: ignore[no-untyped-def]
        raise TimeoutError

    with pytest.raises(AccountsUnavailableError):
        AccountsSessionClient(
            base_url="https://cuenta.carlosrevert.es", transport=transport
        ).get_current_user({})


@pytest.mark.parametrize("status_code", [401, 403, 500, 503])
def test_http_auth_and_upstream_errors_fail_closed(status_code: int) -> None:
    client = AccountsSessionClient(
        base_url="https://cuenta.carlosrevert.es",
        transport=lambda url, headers, timeout: response({}, status_code=status_code),
    )

    with pytest.raises(AccountsUnavailableError):
        client.get_current_user({})


def test_missing_cookie_is_sent_as_an_anonymous_session_check() -> None:
    captured: dict[str, str] = {}

    def transport(url, headers, timeout):  # type: ignore[no-untyped-def]
        captured.update(headers)
        return response({"authenticated": False, "user": None})

    assert AccountsSessionClient(
        base_url="https://cuenta.carlosrevert.es", transport=transport
    ).get_current_user({}) is None
    assert captured == {"Accept": "application/json"}


def test_remote_http_base_url_is_rejected() -> None:
    with pytest.raises(ValueError):
        AccountsSessionClient(base_url="http://accounts.example.test")