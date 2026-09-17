from apps.authentication.permissions import IsAccountsAuthenticated
from apps.common.exceptions import ResourceNotFound


class CanAccessVoice(IsAccountsAuthenticated):
    message = "Debes iniciar sesión para procesar audio."


def require_owned_resource(external_user_id: int, resource_user_id: int) -> None:
    if external_user_id != resource_user_id:
        raise ResourceNotFound("Resource not found")
