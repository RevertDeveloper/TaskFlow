from uuid import UUID

from rest_framework.exceptions import ValidationError

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.common.api import TaskFlowAPIView, paginated_response, success_response
from apps.common.exceptions import ResourceNotFound

from .models import Task
from .permissions import CanAccessTasks
from .selectors import active_tasks_for_user, get_owned_task
from .serializers import TaskCreateSerializer, TaskOutputSerializer, TaskUpdateSerializer
from .services import (
    complete_task,
    create_task,
    delete_task,
    reopen_task,
    update_task,
)


class TaskCollectionView(TaskFlowAPIView):
    permission_classes = (CanAccessTasks,)

    def get(self, request):  # type: ignore[no-untyped-def]
        user_id = _external_user_id(request)
        queryset = active_tasks_for_user(user_id).select_related("list")
        status_filter = request.query_params.get("status")
        if status_filter is not None:
            if status_filter not in {choice for choice, _ in Task.Status.choices}:
                raise ValidationError({"status": "Estado de tarea no válido."})
            queryset = queryset.filter(status=status_filter)
        list_filter = request.query_params.get("list_id")
        if list_filter is not None:
            queryset = queryset.filter(list_id=_parse_uuid(list_filter))
        return paginated_response(request, queryset, TaskOutputSerializer)

    def post(self, request):  # type: ignore[no-untyped-def]
        serializer = TaskCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task = create_task(_external_user_id(request), **serializer.validated_data)
        return success_response(TaskOutputSerializer(task).data, status_code=201)


class TaskDetailView(TaskFlowAPIView):
    permission_classes = (CanAccessTasks,)

    def get(self, request, task_id: str):  # type: ignore[no-untyped-def]
        task = self._get_task(request, task_id)
        return success_response(TaskOutputSerializer(task).data)

    def patch(self, request, task_id: str):  # type: ignore[no-untyped-def]
        serializer = TaskUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        list_id = values.pop("list_id", None)
        task = update_task(
            _external_user_id(request),
            _parse_uuid(task_id),
            list_id=list_id,
            **values,
        )
        return success_response(TaskOutputSerializer(task).data)

    def delete(self, request, task_id: str):  # type: ignore[no-untyped-def]
        delete_task(_external_user_id(request), _parse_uuid(task_id))
        return success_response(None, status_code=204)

    def _get_task(self, request, task_id: str):  # type: ignore[no-untyped-def]
        return get_owned_task(_external_user_id(request), _parse_uuid(task_id))


class TaskCompleteView(TaskFlowAPIView):
    permission_classes = (CanAccessTasks,)

    def post(self, request, task_id: str):  # type: ignore[no-untyped-def]
        task = complete_task(_external_user_id(request), _parse_uuid(task_id))
        return success_response(TaskOutputSerializer(task).data)


class TaskReopenView(TaskFlowAPIView):
    permission_classes = (CanAccessTasks,)

    def post(self, request, task_id: str):  # type: ignore[no-untyped-def]
        task = reopen_task(_external_user_id(request), _parse_uuid(task_id))
        return success_response(TaskOutputSerializer(task).data)


def _external_user_id(request) -> int:  # type: ignore[no-untyped-def]
    principal = request.user
    if not isinstance(principal, AuthenticatedPrincipal):
        raise ResourceNotFound("Task not found")
    return principal.external_user_id


def _parse_uuid(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise ValidationError({"id": "Debe ser un UUID válido."}) from exc
