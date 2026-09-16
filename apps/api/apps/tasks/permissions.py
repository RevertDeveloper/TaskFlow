from apps.authentication.permissions import IsAccountsAuthenticated


class CanAccessTasks(IsAccountsAuthenticated):
    message = "Debes iniciar sesión para acceder a tus tareas."
