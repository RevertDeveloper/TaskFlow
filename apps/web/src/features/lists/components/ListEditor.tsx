"use client";

import { useState } from "react";

import type { ListDraft, ListPatch, TaskList } from "@/domain/list/models";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";

type ListEditorProps = {
  open: boolean;
  list: TaskList | null;
  onClose: () => void;
  onCreate: (input: ListDraft) => Promise<unknown>;
  onUpdate: (id: string, input: ListPatch) => Promise<unknown>;
};

export function ListEditor({ open, list, onClose, onCreate, onUpdate }: ListEditorProps) {
  const [name, setName] = useState(() => list?.name ?? "");
  const [description, setDescription] = useState(() => list?.description ?? "");
  const [emoji, setEmoji] = useState(() => list?.emoji ?? "");
  const [color, setColor] = useState(() => list?.color ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("El nombre es obligatorio.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      if (list) {
        await onUpdate(list.id, { name: trimmedName, description, emoji, color });
      } else {
        await onCreate({ name: trimmedName, description, emoji, color });
      }
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar la lista.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={list ? "Editar lista" : "Nueva lista"} onClose={onClose}>
      <form className="editor-form" onSubmit={handleSubmit} noValidate>
        <Input
          id="list-editor-name"
          label="Nombre"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          disabled={list?.isSystem}
          error={error ?? undefined}
          autoFocus
        />
        <div className="list-editor__row">
          <Input id="list-editor-emoji" label="Emoji" hint="Opcional" value={emoji} onChange={(event) => setEmoji(event.target.value)} maxLength={16} />
          <Input id="list-editor-color" label="Color" hint="Opcional" value={color} onChange={(event) => setColor(event.target.value)} maxLength={32} />
        </div>
        <Textarea
          id="list-editor-description"
          label="Descripción"
          hint="Un contexto breve para reconocer la lista de un vistazo."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
        />
        <div className="editor-form__actions">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={saving}>Guardar lista</Button>
        </div>
      </form>
    </Modal>
  );
}