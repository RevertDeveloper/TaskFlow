from apps.authentication.permissions import IsAccountsAuthenticated


class CanAccessLists(IsAccountsAuthenticated):
    message = "Debes iniciar sesión para acceder a tus listas."
