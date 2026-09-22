from rest_framework import serializers

from .validators import validate_blocks


class NotePayloadSerializer(serializers.Serializer):
    title = serializers.CharField(required=False, allow_blank=True, max_length=500)
    blocks = serializers.JSONField(required=False)
    folder_id = serializers.UUIDField(required=False, allow_null=True)
    pinned = serializers.BooleanField(required=False)

    def validate_blocks(self, value):
        return validate_blocks(value)
