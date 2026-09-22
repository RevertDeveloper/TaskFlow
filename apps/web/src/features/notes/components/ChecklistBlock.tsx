"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { useState } from "react";

import type { ChecklistItem, ChecklistBlockNode } from "@/domain/note/models";
import { indentItem, insertSoftReturn, sortChecklistItems, toggleChecklistItem } from "../application/checklist";

export type ChecklistBlockProps = {
  block: ChecklistBlockNode;
  onChange: (items: ChecklistItem[]) => void;
};

export function ChecklistBlock({ block, onChange }: ChecklistBlockProps) {
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  function toggle(item: ChecklistItem) {
    setCompletingId(item.id);
    const updated = toggleChecklistItem(item);
    if (!block.autoSort) {
      onChange(block.items.map((candidate) => candidate.id === item.id ? updated : candidate));
      setCompletingId(null);
    } else {
      window.setTimeout(() => finishCompletion(item), 300);
    }
  }

  function finishCompletion(item: ChecklistItem) {
    if (completingId !== item.id) return;
    setCompletingId(null);
    if (!block.autoSort) return;
    const updated = block.items.map((candidate) => candidate.id === item.id ? toggleChecklistItem(candidate) : candidate);
    onChange(sortChecklistItems(updated));
  }

  function changeIndent(item: ChecklistItem, delta: 1 | -1) {
    onChange(block.items.map((candidate) => candidate.id === item.id ? indentItem(candidate, delta) : candidate));
  }

  function changeText(item: ChecklistItem, text: string) {
    onChange(block.items.map((candidate) => candidate.id === item.id
      ? { ...candidate, spans: [{ ...candidate.spans[0], text }] }
      : candidate));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>, item: ChecklistItem) {
    if (event.key === "Tab") {
      event.preventDefault();
      changeIndent(item, event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      const target = event.currentTarget.querySelector<HTMLTextAreaElement>(".checklist-item__input");
      if (target) {
        const updated = insertSoftReturn(item, 0, target.selectionStart);
        onChange(block.items.map((candidate) => candidate.id === item.id ? updated : candidate));
      }
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const direction = event.key === "ArrowUp" ? -1 : 1;
      const index = block.items.findIndex((candidate) => candidate.id === item.id);
      const nextIndex = index + direction;
      if (nextIndex >= 0 && nextIndex < block.items.length) {
        const items = [...block.items];
        [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
        onChange(items.map((candidate, position) => ({ ...candidate, position })));
        setAnnouncement(`Ítem movido a la posición ${nextIndex + 1}`);
      }
    }
  }

  return (
    <>
      <ul className="checklist-block" role="group" aria-label="Lista de cotejo">
        {block.items.map((item) => (
          <li
            className={`checklist-item${completingId === item.id ? " checklist-item--completing" : ""}`}
            key={item.id}
            role="checkbox"
            aria-checked={item.status === "completed"}
            style={{ "--indent-level": item.indentLevel } as CSSProperties}
            tabIndex={0}
            onKeyDown={(event) => handleKeyDown(event, item)}
            onAnimationEnd={() => finishCompletion(item)}
          >
            <button className="checklist-item__toggle" type="button" aria-label={item.status === "completed" ? "Marcar como pendiente" : "Marcar como completado"} onClick={() => toggle(item)}>
              <span aria-hidden="true">{item.status === "completed" ? "✓" : ""}</span>
            </button>
            <textarea className={item.status === "completed" ? "checklist-item__input checklist-item__input--completed" : "checklist-item__input"} value={item.spans.map((span) => span.text).join("")} aria-label="Texto del ítem" onChange={(event) => changeText(item, event.target.value)} />
            <button className="checklist-item__handle" type="button" aria-label="Arrastrar para reordenar" tabIndex={0}>⋮⋮</button>
          </li>
        ))}
      </ul>
      <button className="text-button checklist-block__add" type="button" onClick={() => onChange([...block.items, {
        id: crypto.randomUUID(),
        spans: [{ text: "" }],
        status: "pending",
        completedAt: null,
        indentLevel: 0,
        position: block.items.length,
        children: [],
      }])}>Añadir ítem</button>
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </>
  );
}
