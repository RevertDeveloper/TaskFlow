"use client";

import { Trash2 } from "lucide-react";

import type { TaskList } from "@/domain/list/models";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

import type { VoiceReviewTask } from "@/infrastructure/api/generated/types";

type VoiceTaskDraftEditorProps = {
  task: VoiceReviewTask;
  index: number;
  lists: TaskList[];
  selected: boolean;
  onToggle: () => void;
  onChange: (changes: Partial<Pick<VoiceReviewTask, "title" | "description" | "list_id">>) => void;
  onRemove: () => void;
};

export function VoiceTaskDraftEditor({
  task,
  index,
  lists,
  selected,
  onToggle,
  onChange,
  onRemove,
}: VoiceTaskDraftEditorProps) {
  return (
    <article className={`voice-review-task ${selected ? "voice-review-task--selected" : ""}`}>
      <div className="voice-review-task__header">
        <label className="voice-review-task__select">
          <input type="checkbox" checked={selected} onChange={onToggle} />
          <span>Crear</span>
        </label>
        <span className="voice-review-task__route">{routingLabel(task.routing)}</span>
        <button type="button" className="ui-icon-button" onClick={onRemove} aria-label={`Eliminar tarea ${index + 1}`}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
      <Input
        id={`voice-task-${index}-title`}
        label={`Tarea ${index + 1}`}
        value={task.title}
        maxLength={500}
        onChange={(event) => onChange({ title: event.target.value })}
      />
      <Textarea
        id={`voice-task-${index}-description`}
        label="Descripción"
        value={task.description ?? ""}
        maxLength={2000}
        rows={3}
        onChange={(event) => onChange({ description: event.target.value })}
      />
      <div className="ui-field">
        <label htmlFor={`voice-task-${index}-list`}>Lista</label>
        <select
          id={`voice-task-${index}-list`}
          className="ui-input"
          value={task.list_id}
          onChange={(event) => onChange({ list_id: event.target.value })}
        >
          {lists.map((list) => (
            <option key={list.id} value={list.id}>{list.emoji || "·"} {list.name}</option>
          ))}
        </select>
      </div>
    </article>
  );
}

function routingLabel(routing: VoiceReviewTask["routing"]): string {
  return {
    explicit: "Lista indicada",
    current: "Lista actual",
    semantic: "Sugerencia",
    inbox: "Inbox",
  }[routing];
}
