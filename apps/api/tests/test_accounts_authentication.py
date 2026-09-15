import pytest

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.authentication.infrastructure.accounts_authentication import (
    AccountsSessionAuthentication,
    AccountsUnavailable,
)


class FakeClient:
    def __init__(self, principal=None, error=None):
        self.principal = principal
        self.error = error
        self.headers = None

    def get_current_user(self, headers):
        self.headers = headers
        if self.error:
            raise self.error
        return self.principal


class FakeRequest:
    headers = {"Cookie": "sessionid=opaque"}
    method = "GET"


class FakeMutationRequest(FakeRequest):
    method = "POST"

    class DjangoRequest:
        META = {}

    _request = DjangoRequest()


def principal() -> AuthenticatedPrincipal:
    return AuthenticatedPrincipal(123, "user@example.com", "example", "Example", "FREE", True)


def test_returns_accounts_principal_without_trusting_request_identity() -> None:
    client = FakeClient(principal=principal())

    result = AccountsSessionAuthentication(client).authenticate(FakeRequest())

    assert result == (principal(), None)
    assert client.headers == {"Cookie": "sessionid=opaque"}


def test_anonymous_accounts_session_is_not_authenticated() -> None:
    assert AccountsSessionAuthentication(FakeClient()).authenticate(FakeRequest()) is None


def test_accounts_unavailable_fails_closed_with_service_error() -> None:
    from apps.authentication.infrastructure.accounts_client import AccountsUnavailableError

    with pytest.raises(AccountsUnavailable) as raised:
        AccountsSessionAuthentication(FakeClient(error=AccountsUnavailableError())).authenticate(
            FakeRequest()
        )

    assert raised.value.status_code == 503


def test_authenticated_mutation_requires_taskflow_csrf(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(
        "apps.authentication.infrastructure.accounts_authentication.CsrfViewMiddleware.process_view",
        lambda *args: "CSRF cookie missing",
    )

    with pytest.raises(Exception, match="CSRF Failed"):
        AccountsSessionAuthentication(FakeClient(principal=principal())).authenticate(
            FakeMutationRequest()
        )