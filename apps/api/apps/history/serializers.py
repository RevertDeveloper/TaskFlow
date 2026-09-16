from rest_framework import serializers

from .models import TaskEvent


class HistoryOutputSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskEvent
        fields = ("id", "task_id", "event_type", "payload", "created_at")
        read_only_fields = fields
