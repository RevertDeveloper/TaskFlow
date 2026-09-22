"use client";

import { ArrowLeft, CheckSquare, MoreHorizontal, Plus, Undo2 } from "lucide-react";
import { useRef } from "react";

import type { BlockNode, ChecklistItem } from "@/domain/note/models";
import { useNoteEditor } from "../application/useNoteEditor";
import { BlockRenderer } from "./BlockRenderer";

type NoteEditorProps = { onBack: () => void };

export function NoteEditor({ onBack }: NoteEditorProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const { blocks, loading, applyBlockOp, handleKeyDown, undo } = useNoteEditor();

  function replaceBlock(block: BlockNode) { applyBlockOp({ type: "replace", block }); }
  function changeText(blockId: string, text: string) {
    const block = blocks.find((candidate) => candidate.id === blockId);
    if (!block || (block.type !== "paragraph" && block.type !== "heading")) return;
    replaceBlock({ ...block, spans: [{ text }] });
  }
  function changeChecklist(blockId: string, items: ChecklistItem[]) { applyBlockOp({ type: "checklist", blockId, items }); }
  function addParagraph() { applyBlockOp({ type: "insert", block: { id: crypto.randomUUID(), type: "paragraph", spans: [{ text: "" }] } }); }

  return (
    <section className="note-editor" aria-labelledby="note-editor-title">
      <header className="note-editor__toolbar">
        <button className="icon-button" type="button" aria-label="Volver a la biblioteca" onClick={onBack}><ArrowLeft size={20} aria-hidden="true" /></button>
        <span className="note-editor__status" aria-live="polite">{loading ? "Cargando..." : "Guardado localmente"}</span>
        <button className="icon-button" type="button" aria-label="Deshacer" onClick={undo}><Undo2 size={18} aria-hidden="true" /></button>
        <button className="icon-button" type="button" aria-label="Añadir bloque de texto" onClick={addParagraph}><Plus size={18} aria-hidden="true" /></button>
        <button className="icon-button" type="button" aria-label="Más opciones"><MoreHorizontal size={20} aria-hidden="true" /></button>
      </header>
      <div className="note-editor__canvas" onKeyDown={(event) => handleKeyDown(event)}>
        <input ref={titleRef} className="note-editor__title" id="note-editor-title" value={blocks.find((block) => block.type === "heading")?.type === "heading" ? blocks.find((block) => block.type === "heading")?.spans[0]?.text ?? "" : ""} onChange={(event) => {
          const heading = blocks.find((block) => block.type === "heading");
          replaceBlock(heading?.type === "heading" ? { ...heading, spans: [{ text: event.target.value }] } : { id: crypto.randomUUID(), type: "heading", level: 1, spans: [{ text: event.target.value }] });
        }} placeholder="Título" aria-label="Título de la nota" />
        <BlockRenderer blocks={blocks} handlers={{ onChecklistChange: changeChecklist, onTextChange: changeText }} />
        <button className="ui-button ui-button--secondary" type="button" onClick={() => applyBlockOp({ type: "insert", block: { id: crypto.randomUUID(), type: "checklist", autoSort: true, items: [] } })}><CheckSquare size={17} aria-hidden="true" /> Añadir checklist</button>
      </div>
    </section>
  );
}