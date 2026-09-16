"use client";

import type { KeyboardEvent, ReactNode } from "react";

export type Tab = {
  id: string;
  label: string;
  panel: ReactNode;
};

type TabsProps = {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
};

export function Tabs({ tabs, activeId, onChange }: TabsProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) {
      return;
    }
    event.preventDefault();
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    onChange(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  if (!activeTab) {
    return null;
  }

  return (
    <div className="ui-tabs">
      <div className="ui-tabs__list" role="tablist" aria-label="Vistas">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            className="ui-tabs__tab"
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab.id}
            tabIndex={tab.id === activeTab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="ui-tabs__panel" role="tabpanel" aria-labelledby={`tab-${activeTab.id}`}>
        {activeTab.panel}
      </div>
    </div>
  );
}