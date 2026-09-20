from collections.abc import Mapping

from django.middleware.csrf import CsrfViewMiddleware, get_token
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import APIException, PermissionDenied

from apps.common.metrics import observe_accounts_validation

from .accounts_client import (
    AccountsMalformedResponseError,
    AccountsSessionClient,
    AccountsUnavailableError,
)


class AccountsUnavailable(APIException):
    status_code = 503
    default_detail = "El servicio de identidad no está disponible."
    default_code = "accounts_unavailable"


class AccountsSessionAuthentication(BaseAuthentication):
    """Revalidates the Accounts session for every API request."""

    def __init__(self, client: AccountsSessionClient | None = None) -> None:
        self.client = client or AccountsSessionClient()

    def authenticate(self, request):  # type: ignore[no-untyped-def]
        try:
            principal = self.client.get_current_user(_request_headers(request))
        except (AccountsMalformedResponseError, AccountsUnavailableError) as exc:
            observe_accounts_validation(
                "malformed" if isinstance(exc, AccountsMalformedResponseError) else "unavailable"
            )
            raise AccountsUnavailable() from exc
        if principal is None:
            observe_accounts_validation("anonymous")
            return None
        observe_accounts_validation("authenticated")
        self.enforce_csrf(request)
        return principal, None

    def authenticate_header(self, request):  # type: ignore[no-untyped-def]
        return "Session"

    def enforce_csrf(self, request) -> None:  # type: ignore[no-untyped-def]
        if request.method in {"GET", "HEAD", "OPTIONS", "TRACE"}:
            return
        django_request = request._request
        reason = CsrfViewMiddleware(lambda _: None).process_view(
            django_request, lambda _: None, (), {}
        )
        if reason:
            raise PermissionDenied("CSRF Failed")
        get_token(django_request)


def _request_headers(request) -> Mapping[str, str]:  # type: ignore[no-untyped-def]
    return request.headers