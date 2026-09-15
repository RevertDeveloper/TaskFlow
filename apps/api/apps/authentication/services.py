from .domain.models import AuthenticatedPrincipal


def require_authenticated_user(request) -> AuthenticatedPrincipal:  # type: ignore[no-untyped-def]
    principal = request.user
    if not isinstance(principal, AuthenticatedPrincipal):
        raise PermissionError("An authenticated Accounts principal is required")
    return principal