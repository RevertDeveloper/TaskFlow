from rest_framework import serializers

from .models import Task


class TaskOutputSerializer(serializers.ModelSerializer):
    list_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Task
        fields = (
            "id",
            "list_id",
            "title",
            "description",
            "status",
            "source",
            "position",
            "completed_at",
            "deleted_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class TaskCreateSerializer(serializers.Serializer):
    list_id = serializers.UUIDField()
    title = serializers.CharField(min_length=1, max_length=500)
    description = serializers.CharField(required=False, allow_blank=True)
    source = serializers.ChoiceField(choices=Task.Source.choices, required=False)
    position = serializers.IntegerField(required=False, min_value=0)


class TaskUpdateSerializer(serializers.Serializer):
    list_id = serializers.UUIDField(required=False)
    title = serializers.CharField(min_length=1, max_length=500, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    source = serializers.ChoiceField(choices=Task.Source.choices, required=False)
    position = serializers.IntegerField(required=False, min_value=0)
