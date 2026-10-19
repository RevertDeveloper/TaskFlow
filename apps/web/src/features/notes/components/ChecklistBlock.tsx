"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import type { ChecklistItem, ChecklistBlockNode } from "@/domain/note/models";
import { createChecklistItem, indentItem, insertSoftReturn, sortChecklistItems, toggleChecklistItem } from "../application/checklist";

export type ChecklistBlockProps = {
  block: ChecklistBlockNode;
  onChange: (items: ChecklistItem[]) => void;
  focusItemId?: string;
};

export function ChecklistBlock({ block, onChange, focusItemId }: ChecklistBlockProps) {
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const itemRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const latestItems = useRef(block.items);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completingIdRef = useRef<string | null>(null);
  const focusRequest = useRef<string | null>(focusItemId ?? null);
  const lastExternalFocusId = useRef<string | null>(focusItemId ?? null);

  useEffect(() => {
    latestItems.current = block.items;
    if (focusItemId && focusItemId !== lastExternalFocusId.current) {
      lastExternalFocusId.current = focusItemId;
      focusRequest.current = focusItemId;
    }
    const input = focusRequest.current ? itemRefs.current.get(focusRequest.current) : null;
    if (input) {
      input.focus();
      focusRequest.current = null;
    }
  }, [block.items, focusItemId]);

  useEffect(() => () => {
    if (completionTimer.current !== null) clearTimeout(completionTimer.current);
  }, []);

  function toggle(item: ChecklistItem) {
    const updated = toggleChecklistItem(item);
    const changed = block.items.map((candidate) => candidate.id === item.id ? updated : candidate);
    if (completionTimer.current !== null) {
      clearTimeout(completionTimer.current);
      completionTimer.current = null;
    }
    if (!block.autoSort || updated.status === "pending") {
      completingIdRef.current = null;
      setCompletingId(null);
      onChange(block.autoSort ? sortChecklistItems(changed) : changed);
      return;
    }
    completingIdRef.current = item.id;
    setCompletingId(item.id);
    onChange(changed);
    completionTimer.current = setTimeout(() => finishCompletion(item.id), 250);
  }

  function finishCompletion(itemId: string) {
    if (completingIdRef.current !== itemId) return;
    if (completionTimer.current !== null) {
      clearTimeout(completionTimer.current);
      completionTimer.current = null;
    }
    completingIdRef.current = null;
    setCompletingId(null);
    onChange(sortChecklistItems(latestItems.current));
  }

  function changeIndent(item: ChecklistItem, delta: 1 | -1) {
    onChange(block.items.map((candidate) => candidate.id === item.id ? indentItem(candidate, delta) : candidate));
  }

  function changeText(item: ChecklistItem, text: string) {
    onChange(block.items.map((candidate) => candidate.id === item.id
      ? { ...candidate, spans: [{ ...candidate.spans[0], text }] }
      : candidate));
  }

  function moveItem(index: number, delta: 1 | -1) {
    const target = index + delta;
    if (target < 0 || target >= block.items.length) return;
    const items = [...block.items];
    [items[index], items[target]] = [items[target], items[index]];
    onChange(items.map((item, position) => ({ ...item, position })));
    setAnnouncement(`Ítem movido a la posición ${target + 1}`);
  }

  function addItemAfter(item: ChecklistItem) {
    const index = block.items.findIndex((candidate) => candidate.id === item.id);
    const nextItem = createChecklistItem(index + 1);
    const items = [...block.items];
    items.splice(index + 1, 0, nextItem);
    focusRequest.current = nextItem.id;
    onChange(items.map((candidate, position) => ({ ...candidate, position })));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, item: ChecklistItem) {
    if (event.key === "Tab") {
      event.preventDefault();
      changeIndent(item, event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      const target = event.currentTarget;
      const updated = insertSoftReturn(item, 0, target.selectionStart);
      onChange(block.items.map((candidate) => candidate.id === item.id ? updated : candidate));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      addItemAfter(item);
    }
  }

  return (
    <>
      <ul className="checklist-block" aria-label="Lista de tareas">
        {block.items.map((item, index) => (
          <li
            className={`checklist-item${completingId === item.id ? " checklist-item--completing" : ""}`}
            key={item.id}
            style={{ "--indent-level": item.indentLevel } as CSSProperties}
            onAnimationEnd={() => finishCompletion(item.id)}
          >
            <button
              className="checklist-item__toggle"
              type="button"
              aria-label={`Marcar como ${item.status === "completed" ? "pendiente" : "completado"} el ítem ${index + 1}`}
              aria-pressed={item.status === "completed"}
              onClick={() => toggle(item)}
            >
              <span aria-hidden="true">{item.status === "completed" ? "✓" : ""}</span>
            </button>
            <textarea
              rows={1}
              ref={(element) => {
                if (element) {
                  itemRefs.current.set(item.id, element);
                  fitTextarea(element);
                }
                else itemRefs.current.delete(item.id);
              }}
              onInput={(event) => fitTextarea(event.currentTarget)}
              className={item.status === "completed" ? "checklist-item__input checklist-item__input--completed" : "checklist-item__input"}
              value={item.spans.map((span) => span.text).join("")}
              aria-label={`Texto del ítem ${index + 1}`}
              onKeyDown={(event) => handleKeyDown(event, item)}
              onChange={(event) => changeText(item, event.target.value)}
            />
            <div className="checklist-item__actions" aria-label={`Acciones del ítem ${index + 1}`}>
              <button className="checklist-item__move" type="button" aria-label={`Mover ítem ${index + 1} arriba`} disabled={index === 0} onClick={() => moveItem(index, -1)}>
                <ChevronUp size={16} aria-hidden="true" />
              </button>
              <button className="checklist-item__move" type="button" aria-label={`Mover ítem ${index + 1} abajo`} disabled={index === block.items.length - 1} onClick={() => moveItem(index, 1)}>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button className="text-button checklist-block__add" type="button" onClick={() => {
        const item = createChecklistItem(block.items.length);
        focusRequest.current = item.id;
        onChange([...block.items, item]);
      }}>Añadir ítem</button>
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </>
  );
}

function fitTextarea(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}
