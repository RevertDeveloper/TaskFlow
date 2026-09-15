from collections.abc import Mapping
from typing import Protocol

from .models import AuthenticatedPrincipal


class AccountsSessionPort(Protocol):
    """Application port for validating the current Accounts session."""

    def get_current_user(
        self, request_headers: Mapping[str, str]
    ) -> AuthenticatedPrincipal | None:
        """Return the current principal, or None for an anonymous session."""
