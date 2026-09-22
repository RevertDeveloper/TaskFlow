"use client";

import { FileText, Grid2X2, List, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { openTaskFlowDatabase, taskFlowDatabase } from "@/infrastructure/indexeddb/database";

type ViewMode = "list" | "gallery";
type NoteLibraryProps = { searchQuery: string; onCreateNote: () => void };

const viewOptions: readonly SegmentedControlOption<ViewMode>[] = [
  { value: "list", label: "Lista", icon: <List size={16} aria-hidden="true" /> },
  { value: "gallery", label: "Galería", icon: <Grid2X2 size={16} aria-hidden="true" /> },
];

export function NoteLibrary({ searchQuery, onCreateNote }: NoteLibraryProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  useEffect(() => {
    let cancelled = false;
    void openTaskFlowDatabase().then(async () => {
      const stored = await taskFlowDatabase.appState.get("notes_view_mode");
      if (!cancelled && (stored?.value === "list" || stored?.value === "gallery")) setViewMode(stored.value);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    void openTaskFlowDatabase().then(() => taskFlowDatabase.appState.put({ key: "notes_view_mode", value: mode })).catch(() => undefined);
  }

  const hasQuery = searchQuery.trim().length > 0;
  return (
    <section className={`note-library note-library--${viewMode}`} aria-labelledby="note-library-title">
      <header className="note-library__header">
        <div><span className="section-kicker">Biblioteca</span><h2 id="note-library-title">{hasQuery ? `Resultados para “${searchQuery}”` : "Todas las notas"}</h2></div>
        <div className="note-library__actions">
          <SegmentedControl value={viewMode} options={viewOptions} onChange={changeViewMode} label="Modo de vista" />
          <button className="ui-button ui-button--primary" type="button" onClick={onCreateNote}><Plus size={17} aria-hidden="true" /> Nueva nota</button>
        </div>
      </header>
      <div className="note-library__empty" role="status">
        <div className="note-library__empty-icon" aria-hidden="true"><FileText size={26} /></div>
        <h3>{hasQuery ? "No hay coincidencias" : "Tu biblioteca está despejada"}</h3>
        <p>{hasQuery ? "Prueba con otra palabra." : "Empieza con una nota rápida y dale forma después."}</p>
        {!hasQuery ? <button className="text-button" type="button" onClick={onCreateNote}>Crear tu primera nota <span aria-hidden="true">→</span></button> : null}
      </div>
    </section>
  );
}