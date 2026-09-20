from rest_framework import serializers

from .models import VoiceReviewDraft


class VoiceReviewRequestSerializer(serializers.Serializer):
    current_list_id = serializers.UUIDField(required=False, allow_null=True)


class VoiceReviewTaskSerializer(serializers.Serializer):
    title = serializers.CharField(min_length=1, max_length=500, trim_whitespace=True)
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=2000,
    )
    list_id = serializers.UUIDField()


class VoiceReviewConfirmSerializer(serializers.Serializer):
    idempotency_key = serializers.UUIDField()
    tasks = VoiceReviewTaskSerializer(many=True, max_length=20)


class VoiceReviewDraftOutputSerializer(serializers.ModelSerializer):
    session_id = serializers.UUIDField(read_only=True)
    tasks = serializers.ListField(child=serializers.DictField(), read_only=True)
    source = serializers.DictField(read_only=True)
    confirmed_task_ids = serializers.ListField(child=serializers.UUIDField(), read_only=True)

    class Meta:
        model = VoiceReviewDraft
        fields = (
            "id",
            "session_id",
            "status",
            "schema_version",
            "tasks",
            "source",
            "expires_at",
            "confirmed_task_ids",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation["tasks"] = instance.payload.get("tasks", [])
        representation["source"] = instance.payload.get("source", {})
        return representation
