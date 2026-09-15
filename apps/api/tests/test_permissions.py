from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.authentication.permissions import IsAccountsAuthenticated


class Request:
    user = None


def test_private_permission_rejects_anonymous_request() -> None:
    assert IsAccountsAuthenticated().has_permission(Request(), None) is False


def test_private_permission_accepts_only_normalized_accounts_principal() -> None:
    request = Request()
    request.user = AuthenticatedPrincipal(123, "user@example.com", "example", "Example", None, True)

    assert IsAccountsAuthenticated().has_permission(request, None) is True