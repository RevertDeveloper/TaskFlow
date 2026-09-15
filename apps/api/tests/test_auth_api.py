from django.test import Client

from apps.authentication.infrastructure.accounts_client import AccountsSessionClient


def anonymous_accounts_session(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(AccountsSessionClient, "get_current_user", lambda self, headers: None)


def test_csrf_endpoint_sets_taskflow_cookie(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    anonymous_accounts_session(monkeypatch)
    response = Client(enforce_csrf_checks=True).get("/api/v1/auth/csrf/")

    assert response.status_code == 200
    assert "taskflowcsrftoken" in response.cookies
    assert "csrftoken" not in response.cookies


def test_me_is_anonymous_without_accounts_session(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    anonymous_accounts_session(monkeypatch)
    response = Client().get("/api/v1/auth/me/")

    assert response.status_code == 200
    assert response.json() == {"authenticated": False, "user": None}