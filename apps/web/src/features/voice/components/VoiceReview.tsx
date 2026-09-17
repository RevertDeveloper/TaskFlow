"use client";

import { useState } from "react";

import type { TaskList } from "@/domain/list/models";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { VoiceReviewDraft, VoiceReviewTask } from "@/infrastructure/api/generated/types";

import { VoiceTaskDraftEditor } from "./VoiceTaskDraftEditor";

type VoiceReviewProps = {
  draft: VoiceReviewDraft;
  lists: TaskList[];
  open: boolean;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (tasks: Array<Pick<VoiceReviewTask, "title" | "description" | "list_id">>) => Promise<void>;
};

export function VoiceReview({ draft, lists, open, saving = false, onClose, onConfirm }: VoiceReviewProps) {
  const inbox = lists.find((list) => list.isSystem) ?? lists[0];
  const availableLists = lists.filter((list) => !list.isArchived);
  const [tasks, setTasks] = useState<VoiceReviewTask[]>(() => normalizeTasks(draft.tasks, availableLists, inbox?.id));
  const [selected, setSelected] = useState<boolean[]>(() => draft.tasks.map(() => true));
  const [error, setError] = useState<string | null>(null);

  function updateTask(index: number, changes: Partial<Pick<VoiceReviewTask, "title" | "description" | "list_id">>) {
    setTasks((current) => current.map((task, taskIndex) => taskIndex === index ? { ...task, ...changes } : task));
  }

  function removeTask(index: number) {
    setTasks((current) => current.filter((_, taskIndex) => taskIndex !== index));
    setSelected((current) => current.filter((_, taskIndex) => taskIndex !== index));
  }

  async function confirm() {
    const selectedTasks = tasks.filter((_, index) => selected[index]);
    if (selectedTasks.length === 0) {
      setError("Selecciona al menos una tarea para confirmar.");
      return;
    }
    if (selectedTasks.some((task) => !task.title.trim() || !task.list_id)) {
      setError("Cada tarea seleccionada necesita título y lista.");
      return;
    }
    setError(null);
    await onConfirm(selectedTasks.map(({ title, description, list_id }) => ({
      title: title.trim(),
      description: description?.trim() || null,
      list_id,
    })));
  }

  return (
    <Modal open={open} title="Revisar tareas de voz" onClose={onClose}>
      <div className="voice-review">
        <div className="voice-review__intro">
          <p className="eyebrow">Antes de crear</p>
          <p>Comprueba el texto, ajusta las listas y decide qué tareas pasan a tus pendientes.</p>
        </div>
        <div className="voice-review__tasks">
          {tasks.map((task, index) => (
            <VoiceTaskDraftEditor
              key={`${draft.id}-${index}`}
              task={task}
              index={index}
              lists={availableLists}
              selected={selected[index] ?? false}
              onToggle={() => setSelected((current) => current.map((value, taskIndex) => taskIndex === index ? !value : value))}
              onChange={(changes) => updateTask(index, changes)}
              onRemove={() => removeTask(index)}
            />
          ))}
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="editor-form__actions">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={() => void confirm()} loading={saving}>Crear seleccionadas</Button>
        </div>
      </div>
    </Modal>
  );
}

function normalizeTasks(tasks: VoiceReviewTask[], lists: TaskList[], inboxId?: string): VoiceReviewTask[] {
  const validIds = new Set(lists.map((list) => list.id));
  return tasks.map((task) => validIds.has(task.list_id) || !inboxId ? task : { ...task, list_id: inboxId, routing: "inbox" });
}
