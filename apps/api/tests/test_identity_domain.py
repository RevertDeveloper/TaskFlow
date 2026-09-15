import pytest

from apps.authentication.domain.models import (
    AuthenticatedPrincipal,
    IdentityPayloadError,
    normalize_account_user,
)


def test_normalizes_accounts_user_payload() -> None:
    principal = normalize_account_user(
        {
            "id": 123,
            "username": "example",
            "email": "user@example.com",
            "email_verified": True,
            "first_name": "Ada",
            "last_name": "Lovelace",
            "plan": "FREE",
        }
    )

    assert principal == AuthenticatedPrincipal(
        external_user_id=123,
        email="user@example.com",
        username="example",
        display_name="Ada Lovelace",
        plan="FREE",
        email_verified=True,
    )


def test_uses_username_when_account_has_no_display_name() -> None:
    principal = normalize_account_user(
        {
            "id": 123,
            "username": "example",
            "email": "user@example.com",
            "email_verified": False,
            "first_name": "",
            "last_name": "",
            "plan": None,
        }
    )

    assert principal.display_name == "example"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("id", "123"),
        ("id", 0),
        ("email", ""),
        ("username", None),
        ("email_verified", "true"),
    ],
)
def test_rejects_invalid_accounts_identity_fields(field: str, value: object) -> None:
    payload: dict[str, object] = {
        "id": 123,
        "username": "example",
        "email": "user@example.com",
        "email_verified": True,
    }
    payload[field] = value

    with pytest.raises(IdentityPayloadError):
        normalize_account_user(payload)