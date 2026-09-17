from rest_framework.throttling import ScopedRateThrottle


class TaskFlowScopedRateThrottle(ScopedRateThrottle):
    def get_cache_key(self, request, view):  # type: ignore[no-untyped-def]
        if not self.scope:
            return None
        external_user_id = getattr(request.user, "external_user_id", None)
        if isinstance(external_user_id, int) and not isinstance(external_user_id, bool):
            identity = f"user:{external_user_id}"
        else:
            identity = f"ip:{self.get_ident(request)}"
        return self.cache_format % {"scope": self.scope, "ident": identity}