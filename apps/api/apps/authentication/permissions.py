from rest_framework.permissions import BasePermission


class IsAccountsAuthenticated(BasePermission):
    message = "Debes iniciar sesión para acceder a este recurso."

    def has_permission(self, request, view) -> bool:  # type: ignore[no-untyped-def]
        return bool(getattr(request.user, "is_authenticated", False))