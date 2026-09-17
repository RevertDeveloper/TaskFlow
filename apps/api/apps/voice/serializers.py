from rest_framework import serializers

from .models import VoiceSession


class VoiceUploadSerializer(serializers.Serializer):
    audio = serializers.FileField(required=True, allow_empty_file=False)
    transcript_retention = serializers.BooleanField(required=False, default=False)


class VoiceSessionOutputSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoiceSession
        fields = (
            "id",
            "status",
            "transcript",
            "transcript_retention",
            "error_code",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields
