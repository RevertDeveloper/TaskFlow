"use client";

import { Bookmark, FileText, Grid2X2, List, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { openTaskFlowDatabase, taskFlowDatabase } from "@/infrastructure/indexeddb/database";
import { deriveNoteTitle, IndexedDbNoteRepository } from "@/infrastructure/indexeddb/IndexedDbNoteRepository";
import type { Note } from "@/domain/note/models";

type ViewMode = "list" | "gallery";
type NoteLibraryProps = { searchQuery: string; folderId?: string | null; tag?: string | null; onCreateNote: () => void; onOpenNote: (noteId: string) => void };
const noteRepository = new IndexedDbNoteRepository();

const viewOptions: readonly SegmentedControlOption<ViewMode>[] = [
  { value: "list", label: "Lista", icon: <List size={16} aria-hidden="true" /> },
  { value: "gallery", label: "Galería", icon: <Grid2X2 size={16} aria-hidden="true" /> },
];

export function NoteLibrary({ searchQuery, folderId, tag, onCreateNote, onOpenNote }: NoteLibraryProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    let cancelled = false;
    void openTaskFlowDatabase().then(async () => {
      const stored = await taskFlowDatabase.appState.get("notes_view_mode");
      if (!cancelled && (stored?.value === "list" || stored?.value === "gallery")) setViewMode(stored.value);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = searchQuery.trim() ? await noteRepository.search(searchQuery) : await noteRepository.findAll(folderId ?? undefined);
      const filtered = tag ? result.filter((note) => note.tags.includes(tag)) : result;
      if (!cancelled) setNotes(filtered);
    };
    void load().catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, [folderId, searchQuery, tag]);

  useEffect(() => {
    const refresh = () => {
      const query = searchQuery.trim();
      void (query ? noteRepository.search(query) : noteRepository.findAll(folderId ?? undefined)).then((result) => setNotes(tag ? result.filter((note) => note.tags.includes(tag)) : result)).catch(() => undefined);
    };
    window.addEventListener("taskflow:local-change", refresh);
    return () => window.removeEventListener("taskflow:local-change", refresh);
  }, [folderId, searchQuery, tag]);

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
      {notes.length > 0 ? <div className={`note-library__notes note-library__notes--${viewMode}`}>
        {notes.map((note) => <NoteCard key={note.id} note={note} onOpen={() => onOpenNote(note.id)} />)}
      </div> : <div className="note-library__empty" role="status">
        <div className="note-library__empty-icon" aria-hidden="true"><FileText size={26} /></div>
        <h3>{hasQuery ? "No hay coincidencias" : "Tu biblioteca está despejada"}</h3>
        <p>{hasQuery ? "Prueba con otra palabra." : "Empieza con una nota rápida y dale forma después."}</p>
        {!hasQuery ? <button className="text-button" type="button" onClick={onCreateNote}>Crear tu primera nota <span aria-hidden="true">→</span></button> : null}
      </div>}
    </section>
  );
}

function NoteCard({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const displayTitle = note.title || deriveNoteTitle(note.blocks);
  const bodyBlocks = note.blocks[0]?.type === "heading"
    && displayTitle.trim() !== ""
    && note.blocks[0].spans.map((span) => span.text).join("").trim() === displayTitle.trim()
    ? note.blocks.slice(1)
    : note.blocks;
  const preview = bodyBlocks.flatMap((block) => {
    if (block.type === "code") return [block.text];
    if (block.type === "divider") return [];
    if (block.type === "checklist") return block.items.map((item) => item.spans.map((span) => span.text).join(""));
    return [block.spans.map((span) => span.text).join("")];
  }).filter(Boolean).join(" ");
  return <button className="note-card" type="button" onClick={onOpen}>
    <div className="note-card__preview" aria-hidden="true">{preview.slice(0, 180)}</div>
    <span className="note-card__title"><strong>{displayTitle || "Nota sin título"}</strong>{note.pinned ? <span className="note-card__pinned"><Bookmark size={15} aria-hidden="true" /><span className="sr-only">Fijada</span></span> : null}</span>
    <time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleDateString("es-ES")}</time>
  </button>;
}