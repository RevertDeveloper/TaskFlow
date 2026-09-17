from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.common.api import TaskFlowAPIView, success_response

from .permissions import CanAccessSync
from .serializers import SyncPullQuerySerializer, SyncPushSerializer
from .services.common import InvalidSyncCursor
from .services.pull import pull_changes
from .services.push import push_operations


class SyncPushView(TaskFlowAPIView):
    permission_classes = (CanAccessSync,)
    throttle_scope = "sync_push"

    @extend_schema(operation_id="sync_push", request=SyncPushSerializer)
    def post(self, request):  # type: ignore[no-untyped-def]
        serializer = SyncPushSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = push_operations(
            _external_user_id(request), serializer.validated_data["operations"]
        )
        return success_response(result)


class SyncPullView(TaskFlowAPIView):
    permission_classes = (CanAccessSync,)

    @extend_schema(
        operation_id="sync_pull",
        parameters=[
            OpenApiParameter(name="cursor", type=str, required=False),
            OpenApiParameter(name="limit", type=int, required=False),
        ],
    )
    def get(self, request):  # type: ignore[no-untyped-def]
        serializer = SyncPullQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            result = pull_changes(
                _external_user_id(request),
                cursor=serializer.validated_data.get("cursor") or None,
                limit=serializer.validated_data["limit"],
            )
        except InvalidSyncCursor as exc:
            raise ValidationError({"cursor": str(exc)}) from exc
        return success_response(result)


def _external_user_id(request) -> int:  # type: ignore[no-untyped-def]
    principal = request.user
    if not isinstance(principal, AuthenticatedPrincipal):
        raise ValidationError("La identidad de Accounts no está disponible.")
    return principal.external_user_id