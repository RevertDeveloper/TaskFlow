"use client";

import type { KeyboardEvent } from "react";

export type ListOption = {
  id: string;
  name: string;
  emoji?: string;
};

type ListSwitcherProps = {
  lists: ListOption[];
  activeListId: string;
  onChange: (listId: string) => void;
};

export function ListSwitcher({ lists, activeListId, onChange }: ListSwitcherProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction || lists.length === 0) {
      return;
    }
    event.preventDefault();
    const next = lists[(index + direction + lists.length) % lists.length];
    onChange(next.id);
    document.getElementById(`list-option-${next.id}`)?.focus();
  }

  return (
    <section className="list-switcher" aria-labelledby="list-switcher-title">
      <div className="list-switcher__header">
        <p id="list-switcher-title" className="eyebrow">Vista actual</p>
        <span className="list-switcher__hint">Desliza para cambiar</span>
      </div>
      <div className="list-switcher__track" role="tablist" aria-label="Listas de tareas">
        {lists.map((list, index) => (
          <button
            key={list.id}
            id={`list-option-${list.id}`}
            type="button"
            role="tab"
            aria-selected={list.id === activeListId}
            tabIndex={list.id === activeListId ? 0 : -1}
            onClick={() => onChange(list.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span aria-hidden="true">{list.emoji ?? "·"}</span>
            {list.name}
          </button>
        ))}
      </div>
    </section>
  );
}