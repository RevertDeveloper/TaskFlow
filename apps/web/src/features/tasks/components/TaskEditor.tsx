"use client";

import { useState } from "react";

import type { TaskList } from "@/domain/list/models";
import type { Task, TaskDraft, TaskPatch } from "@/domain/task/models";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";

type TaskEditorProps = {
  open: boolean;
  task: Task | null;
  lists: TaskList[];
  defaultListId: string | null;
  onClose: () => void;
  onCreate: (input: TaskDraft) => Promise<unknown>;
  onUpdate: (id: string, input: TaskPatch) => Promise<unknown>;
};

export function TaskEditor({ open, task, lists, defaultListId, onClose, onCreate, onUpdate }: TaskEditorProps) {
  const [title, setTitle] = useState(() => task?.title ?? "");
  const [description, setDescription] = useState(() => task?.description ?? "");
  const [listId, setListId] = useState(() => task?.listId ?? defaultListId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("El título es obligatorio.");
      return;
    }
    if (!listId) {
      setError("Elige una lista.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      if (task) {
        await onUpdate(task.id, { title: trimmedTitle, description, listId });
      } else {
        await onCreate({ title: trimmedTitle, description, listId });
      }
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar la tarea.");
    } finally {
      setSaving(false);
    }
  }

  const availableLists = lists.filter((list) => !list.isArchived || list.id === task?.listId);

  return (
    <Modal open={open} title={task ? "Editar tarea" : "Nueva tarea"} onClose={onClose}>
      <form className="editor-form" onSubmit={handleSubmit} noValidate>
        <Input
          id="task-editor-title"
          label="Título"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={500}
          autoFocus
          error={error ?? undefined}
        />
        <Textarea
          id="task-editor-description"
          label="Descripción"
          hint="Opcional. Añade contexto sin perder la captura rápida."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
        />
        <div className="ui-field">
          <label htmlFor="task-editor-list">Lista</label>
          <select id="task-editor-list" className="ui-input" value={listId} onChange={(event) => setListId(event.target.value)}>
            <option value="" disabled>Selecciona una lista</option>
            {availableLists.map((list) => (
              <option key={list.id} value={list.id}>{list.emoji || "·"} {list.name}</option>
            ))}
          </select>
        </div>
        <div className="editor-form__actions">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={saving}>Guardar tarea</Button>
        </div>
      </form>
    </Modal>
  );
}