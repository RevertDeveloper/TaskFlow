"use client";

import { Plus } from "lucide-react";
import { useRef, useState } from "react";

import type { TaskDraft } from "@/domain/task/models";
import { Button } from "@/components/ui/Button";

type QuickTaskInputProps = {
  defaultListId: string | null;
  onCreate: (input: TaskDraft) => Promise<unknown>;
};

export function QuickTaskInput({ defaultListId, onCreate }: QuickTaskInputProps) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Escribe un título para crear la tarea.");
      inputRef.current?.focus();
      return;
    }
    if (!defaultListId) {
      setError("No hay una lista disponible todavía.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onCreate({ listId: defaultListId, title: trimmedTitle });
      setTitle("");
      inputRef.current?.focus();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo crear la tarea.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="quick-task-input" onSubmit={handleSubmit} noValidate>
      <div className="quick-task-input__field">
        <span className="quick-task-input__mark" aria-hidden="true">+</span>
        <label className="sr-only" htmlFor="quick-task-title">Nueva tarea</label>
        <input
          ref={inputRef}
          id="quick-task-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Captura una tarea y pulsa Enter..."
          maxLength={500}
          aria-describedby={error ? "quick-task-error" : undefined}
          aria-invalid={error ? true : undefined}
          disabled={saving || !defaultListId}
        />
      </div>
      <Button type="submit" loading={saving} disabled={!defaultListId}>
        <Plus size={17} aria-hidden="true" />
        Añadir
      </Button>
      {error ? <p id="quick-task-error" className="form-error" role="alert">{error}</p> : null}
    </form>
  );
}