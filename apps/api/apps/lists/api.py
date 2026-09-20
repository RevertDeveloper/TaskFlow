from uuid import UUID

from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework.exceptions import ValidationError

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.common.api import TaskFlowAPIView, paginated_response, success_response
from apps.common.exceptions import ResourceNotFound

from .permissions import CanAccessLists
from .selectors import get_owned_list, lists_for_user
from .serializers import ListCreateSerializer, ListOutputSerializer, ListUpdateSerializer
from .services.create_list import create_list
from .services.delete_list import delete_list
from .services.ensure_inbox import ensure_inbox_for_user
from .services.update_list import update_list


@extend_schema_view(
    get=extend_schema(
        operation_id="lists_list",
        responses={200: ListOutputSerializer(many=True)},
    ),
    post=extend_schema(
        operation_id="lists_create",
        request=ListCreateSerializer,
        responses={201: ListOutputSerializer},
    ),
)
class ListCollectionView(TaskFlowAPIView):
    permission_classes = (CanAccessLists,)

    def get(self, request):
        user_id = _external_user_id(request)
        ensure_inbox_for_user(user_id)
        queryset = lists_for_user(user_id)
        archived = request.query_params.get("archived")
        if archived is not None:
            if archived not in {"true", "false"}:
                raise ValidationError({"archived": "Debe ser true o false."})
            queryset = queryset.filter(is_archived=archived == "true")
        return paginated_response(request, queryset, ListOutputSerializer)

    def post(self, request):
        serializer = ListCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task_list = create_list(_external_user_id(request), **serializer.validated_data)
        return success_response(ListOutputSerializer(task_list).data, status_code=201)


@extend_schema_view(
    get=extend_schema(operation_id="lists_retrieve", responses={200: ListOutputSerializer}),
    patch=extend_schema(
        operation_id="lists_partial_update",
        request=ListUpdateSerializer,
        responses={200: ListOutputSerializer},
    ),
    delete=extend_schema(operation_id="lists_destroy", responses={204: None}),
)
class ListDetailView(TaskFlowAPIView):
    permission_classes = (CanAccessLists,)

    def get(self, request, list_id: str):
        task_list = self._get_list(request, list_id)
        return success_response(ListOutputSerializer(task_list).data)

    def patch(self, request, list_id: str):
        serializer = ListUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        task_list = update_list(
            _external_user_id(request),
            _parse_uuid(list_id),
            **serializer.validated_data,
        )
        return success_response(ListOutputSerializer(task_list).data)

    def delete(self, request, list_id: str):
        delete_list(_external_user_id(request), _parse_uuid(list_id))
        return success_response(None, status_code=204)

    def _get_list(self, request, list_id: str):
        return get_owned_list(_external_user_id(request), _parse_uuid(list_id))


def _external_user_id(request) -> int:
    principal = request.user
    if not isinstance(principal, AuthenticatedPrincipal):
        raise ResourceNotFound("List not found")
    return principal.external_user_id


def _parse_uuid(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise ResourceNotFound("List not found") from exc
