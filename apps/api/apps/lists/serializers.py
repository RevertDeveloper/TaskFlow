from rest_framework import serializers

from .models import List


class ListOutputSerializer(serializers.ModelSerializer):
    class Meta:
        model = List
        fields = (
            "id",
            "name",
            "description",
            "emoji",
            "color",
            "position",
            "is_archived",
            "is_system",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class ListCreateSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=1, max_length=120)
    description = serializers.CharField(required=False, allow_blank=True)
    emoji = serializers.CharField(required=False, allow_blank=True, max_length=16)
    color = serializers.CharField(required=False, allow_blank=True, max_length=32)
    position = serializers.IntegerField(required=False, min_value=0)


class ListUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=1, max_length=120, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    emoji = serializers.CharField(required=False, allow_blank=True, max_length=16)
    color = serializers.CharField(required=False, allow_blank=True, max_length=32)
    position = serializers.IntegerField(required=False, min_value=0)
    is_archived = serializers.BooleanField(required=False)
