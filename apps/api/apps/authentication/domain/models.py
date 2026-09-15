from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AuthenticatedPrincipal:
    """Identity normalized from the Accounts session contract."""

    external_user_id: int
    email: str
    username: str
    display_name: str
    plan: str | None
    email_verified: bool

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_anonymous(self) -> bool:
        return False


class IdentityPayloadError(ValueError):
    """Raised when Accounts returns an invalid authenticated user payload."""


def normalize_account_user(payload: object) -> AuthenticatedPrincipal:
    if not isinstance(payload, dict):
        raise IdentityPayloadError("Accounts user payload must be an object")

    external_user_id = payload.get("id")
    if isinstance(external_user_id, bool) or not isinstance(external_user_id, int):
        raise IdentityPayloadError("Accounts user id must be an integer")
    if external_user_id <= 0:
        raise IdentityPayloadError("Accounts user id must be positive")

    email = _required_string(payload, "email")
    username = _required_string(payload, "username")
    first_name = _optional_string(payload, "first_name")
    last_name = _optional_string(payload, "last_name")
    display_name = " ".join(part for part in (first_name, last_name) if part).strip()

    return AuthenticatedPrincipal(
        external_user_id=external_user_id,
        email=email,
        username=username,
        display_name=display_name or username,
        plan=_optional_string(payload, "plan"),
        email_verified=_required_bool(payload, "email_verified"),
    )


def _required_string(payload: dict[object, object], field: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        raise IdentityPayloadError(f"Accounts user field '{field}' must be a non-empty string")
    return value


def _optional_string(payload: dict[object, object], field: str) -> str | None:
    value = payload.get(field)
    if value is None:
        return None
    if not isinstance(value, str):
        raise IdentityPayloadError(f"Accounts user field '{field}' must be a string or null")
    return value.strip() or None


def _required_bool(payload: dict[object, object], field: str) -> bool:
    value = payload.get(field)
    if not isinstance(value, bool):
        raise IdentityPayloadError(f"Accounts user field '{field}' must be a boolean")
    return value