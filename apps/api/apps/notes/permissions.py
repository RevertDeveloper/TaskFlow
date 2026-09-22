from apps.authentication.permissions import IsAccountsAuthenticated


class CanAccessNotes(IsAccountsAuthenticated):
    message = "Debes iniciar sesión para acceder a tus notas."
