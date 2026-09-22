"use client";

import { ArrowLeft, Bold, Code2, Italic, MoreHorizontal } from "lucide-react";
import type { SyntheticEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { openTaskFlowDatabase, taskFlowDatabase } from "@/infrastructure/indexeddb/database";

type NoteEditorProps = { onBack: () => void };

export function NoteEditor({ onBack }: NoteEditorProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [hasSelection, setHasSelection] = useState(false);

  useEffect(() => {
    titleRef.current?.focus();
    void openTaskFlowDatabase().then(async () => {
      const stored = await taskFlowDatabase.appState.get("note_draft");
      if (stored?.value && typeof stored.value === "object" && !Array.isArray(stored.value)) {
        const draft = stored.value;
        if (typeof draft.title === "string") setTitle(draft.title);
        if (typeof draft.body === "string") setBody(draft.body);
      }
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void openTaskFlowDatabase()
        .then(() => taskFlowDatabase.appState.put({ key: "note_draft", value: { title, body } }))
        .catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [body, title]);

  function updateSelection(event: SyntheticEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget;
    setHasSelection(textarea.selectionStart !== textarea.selectionEnd);
  }

  return (
    <section className="note-editor" aria-labelledby="note-editor-title">
      <header className="note-editor__toolbar">
        <button className="icon-button" type="button" aria-label="Volver a la biblioteca" onClick={onBack}><ArrowLeft size={20} aria-hidden="true" /></button>
        <span className="note-editor__status" aria-live="polite">Guardado localmente</span>
        <button className="icon-button" type="button" aria-label="Más opciones"><MoreHorizontal size={20} aria-hidden="true" /></button>
      </header>
      {hasSelection ? <div className="note-editor__formatting" role="toolbar" aria-label="Formato de texto">
        <button type="button" aria-label="Negrita"><Bold size={16} aria-hidden="true" /></button>
        <button type="button" aria-label="Cursiva"><Italic size={16} aria-hidden="true" /></button>
        <button type="button" aria-label="Código inline"><Code2 size={16} aria-hidden="true" /></button>
        <span className="note-editor__swatches" aria-label="Colores de resaltado">
          <button className="swatch swatch--pink" type="button" aria-label="Resaltar en rosa" />
          <button className="swatch swatch--purple" type="button" aria-label="Resaltar en morado" />
          <button className="swatch swatch--orange" type="button" aria-label="Resaltar en naranja" />
          <button className="swatch swatch--mint" type="button" aria-label="Resaltar en menta" />
          <button className="swatch swatch--blue" type="button" aria-label="Resaltar en azul" />
        </span>
      </div> : null}
      <div className="note-editor__canvas">
        <input ref={titleRef} className="note-editor__title" id="note-editor-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título" aria-label="Título de la nota" />
        <textarea className="note-editor__body" value={body} onChange={(event) => setBody(event.target.value)} onSelect={updateSelection} onMouseUp={updateSelection} onKeyUp={updateSelection} placeholder="Escribe lo que tienes en mente..." aria-label="Contenido de la nota" />
      </div>
    </section>
  );
}