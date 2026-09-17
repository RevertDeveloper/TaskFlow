from rest_framework import serializers


class SyncOperationInputSerializer(serializers.Serializer):
    operation_id = serializers.UUIDField()
    device_id = serializers.UUIDField()
    entity_type = serializers.ChoiceField(choices=("list", "task"))
    entity_id = serializers.UUIDField()
    mutation = serializers.ChoiceField(choices=("create", "update", "delete"))
    client_version = serializers.IntegerField(min_value=0)
    client_timestamp = serializers.DateTimeField()
    payload_version = serializers.IntegerField(min_value=1)
    payload = serializers.JSONField()
    idempotency_key = serializers.UUIDField(required=False)

    def validate_payload(self, value):  # type: ignore[no-untyped-def]
        if not isinstance(value, dict):
            raise serializers.ValidationError("El payload debe ser un objeto JSON.")
        return value


class SyncPushSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1, max_value=1)
    operations = SyncOperationInputSerializer(many=True, min_length=1, max_length=100)


class SyncPullQuerySerializer(serializers.Serializer):
    cursor = serializers.CharField(required=False, allow_blank=True, max_length=512)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=100, default=100)