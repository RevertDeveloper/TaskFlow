from uuid import UUID

from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.common.api import TaskFlowAPIView, paginated_response
from apps.common.exceptions import ResourceNotFound
from apps.lists.selectors import get_owned_list

from .permissions import CanAccessHistory
from .selectors import events_for_list, events_for_user
from .serializers import HistoryOutputSerializer


@extend_schema_view(
    get=extend_schema(
        operation_id="history_list",
        responses={200: HistoryOutputSerializer(many=True)},
    )
)
class HistoryView(TaskFlowAPIView):
    permission_classes = (CanAccessHistory,)

    def get(self, request):
        queryset = events_for_user(_external_user_id(request))
        task_id = request.query_params.get("task_id")
        if task_id:
            queryset = queryset.filter(task_id=_parse_uuid(task_id))
        return paginated_response(request, queryset, HistoryOutputSerializer)


@extend_schema_view(
    get=extend_schema(
        operation_id="lists_history_list",
        responses={200: HistoryOutputSerializer(many=True)},
    )
)
class ListHistoryView(TaskFlowAPIView):
    permission_classes = (CanAccessHistory,)

    def get(self, request, list_id: str):
        parsed_list_id = _parse_uuid(list_id)
        get_owned_list(_external_user_id(request), parsed_list_id)
        return paginated_response(
            request,
            events_for_list(_external_user_id(request), parsed_list_id),
            HistoryOutputSerializer,
        )


def _external_user_id(request) -> int:
    principal = request.user
    if not isinstance(principal, AuthenticatedPrincipal):
        raise ResourceNotFound("History not found")
    return principal.external_user_id


def _parse_uuid(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise ResourceNotFound("History not found") from exc
