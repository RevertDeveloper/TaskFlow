"use client";

import { useState } from "react";

import { ListSwitcher } from "@/components/navigation/ListSwitcher";

const lists = [
  { id: "inbox", name: "Inbox", emoji: "·" },
  { id: "today", name: "Hoy", emoji: "○" },
  { id: "ideas", name: "Ideas", emoji: "✦" },
];

export function DashboardView() {
  const [activeListId, setActiveListId] = useState("inbox");

  return (
    <section className="page-section" aria-labelledby="dashboard-title">
      <p className="eyebrow">Espacio personal</p>
      <h1 id="dashboard-title">Tus tareas, en claro.</h1>
      <p className="page-lede">Captura lo importante y vuelve a lo que tienes entre manos.</p>
      <ListSwitcher lists={lists} activeListId={activeListId} onChange={setActiveListId} />
      <div className="empty-panel">
        <p className="empty-panel__label">{lists.find((list) => list.id === activeListId)?.name}</p>
        <h2>Tu bandeja aparecerá aquí.</h2>
        <p>La gestión de tareas se conecta en la siguiente fase del producto.</p>
      </div>
    </section>
  );
}