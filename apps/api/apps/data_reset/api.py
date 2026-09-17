from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.common.api import TaskFlowAPIView, success_response
from apps.history.models import TaskEvent
from apps.lists.models import List
from apps.lists.permissions import CanAccessLists
from apps.lists.services.ensure_inbox import ensure_inbox_for_user
from apps.sync.models import SyncOperation
from apps.tasks.models import Task

RESET_CONFIRMATION = "RESET TASKFLOW DATA"


class ResetCloudSerializer(serializers.Serializer):
    confirmation = serializers.CharField(max_length=len(RESET_CONFIRMATION), trim_whitespace=False)


@extend_schema(
    operation_id="reset_taskflow_data",
    request=ResetCloudSerializer,
    responses={200: dict},
)
class ResetCloudView(TaskFlowAPIView):
    permission_classes = (CanAccessLists,)
    throttle_scope = "data_reset"

    def post(self, request):  # type: ignore[no-untyped-def]
        serializer = ResetCloudSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data["confirmation"] != RESET_CONFIRMATION:
            raise ValidationError({"confirmation": "La confirmacion literal no coincide."})
        principal = request.user
        if not isinstance(principal, AuthenticatedPrincipal):
            raise ValidationError("La identidad de la sesion no es valida.")
        deleted = reset_taskflow_data(principal.external_user_id)
        return success_response({"deleted": deleted})


def reset_taskflow_data(external_user_id: int) -> dict[str, int]:
    with transaction.atomic():
        events = TaskEvent.objects.filter(external_user_id=external_user_id).delete()[0]
        sync_operations = SyncOperation.objects.filter(
            external_user_id=external_user_id
        ).delete()[0]
        tasks = Task.objects.filter(external_user_id=external_user_id).delete()[0]
        lists = List.objects.filter(external_user_id=external_user_id, is_system=False).delete()[0]
        ensure_inbox_for_user(external_user_id)
    return {"events": events, "sync_operations": sync_operations, "tasks": tasks, "lists": lists}
