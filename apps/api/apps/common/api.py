from collections.abc import Mapping
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView, exception_handler

from .exceptions import ProtectedResourceError, ResourceNotFound


def success_response(
    data: Any, *, meta: Mapping[str, Any] | None = None, status_code: int = 200
) -> Response:
    return Response({"data": data, "meta": dict(meta or {})}, status=status_code)


def error_response(
    code: str, message: str, *, details: Any = None, status_code: int = 400
) -> Response:
    return Response(
        {
            "error": {
                "code": code,
                "message": message,
                "details": details if details is not None else {},
            }
        },
        status=status_code,
    )


class TaskFlowAPIView(APIView):
    def handle_exception(self, exc: Exception) -> Response:
        if isinstance(exc, ResourceNotFound):
            return error_response("not_found", str(exc), status_code=status.HTTP_404_NOT_FOUND)
        if isinstance(exc, ProtectedResourceError):
            return error_response(
                "protected_resource", str(exc), status_code=status.HTTP_409_CONFLICT
            )
        if isinstance(exc, DjangoValidationError):
            return error_response(
                "validation_error",
                "La solicitud no es válida.",
                details=exc.message_dict if hasattr(exc, "message_dict") else exc.messages,
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        return super().handle_exception(exc)


def taskflow_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    response = exception_handler(exc, context)
    if response is None:
        return response

    if isinstance(exc, APIException) and response.status_code == status.HTTP_401_UNAUTHORIZED:
        code = "authentication_required"
        message = "Debes iniciar sesión para acceder a este recurso."
        details: Any = {}
    elif isinstance(exc, ValidationError):
        code = "validation_error"
        message = "La solicitud no es válida."
        details = response.data
    else:
        code = getattr(exc, "default_code", "api_error")
        message = (
            str(response.data)
            if isinstance(response.data, str)
            else "La solicitud no se pudo completar."
        )
        details = response.data if isinstance(response.data, dict | list) else {}

    response.data = {"error": {"code": code, "message": message, "details": details}}
    return response


class TaskFlowPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


def paginated_response(request, queryset, serializer_class) -> Response:
    paginator = TaskFlowPagination()
    page = paginator.paginate_queryset(queryset, request)
    serializer = serializer_class(page, many=True)
    return success_response(
        serializer.data,
        meta={
            "page": paginator.page.number,
            "page_size": paginator.get_page_size(request),
            "total_count": paginator.page.paginator.count,
            "total_pages": paginator.page.paginator.num_pages,
        },
    )
