"use client";

import { Menu } from "lucide-react";
import { useEffect, useState } from "react";

import { Drawer } from "@/components/ui/Drawer";
import { NoteEditor } from "./NoteEditor";
import { NoteLibrary } from "./NoteLibrary";
import { NoteSidebar } from "./NoteSidebar";

export function NotesWorkspace() {
  const [searchQuery, setSearchQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "n") { event.preventDefault(); setEditing(true); }
      if (modifier && event.key.toLowerCase() === "k") { event.preventDefault(); document.querySelector<HTMLInputElement>(".notes-search input")?.focus(); }
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  function createNote() { setNoteId(null); setEditing(true); setDrawerOpen(false); }
  function openNote(id: string) { setNoteId(id); setEditing(true); setDrawerOpen(false); }
  function renderSidebar(close?: () => void) { return <NoteSidebar searchQuery={searchQuery} onSearchChange={setSearchQuery} onCreateNote={createNote} onClose={close} activeFolderId={folderId} activeTag={tag} onFolderChange={setFolderId} onTagChange={setTag} />; }

  return (
    <div className="notes-frame">
      <div className="notes-mobile-header"><button className="icon-button" type="button" aria-label="Abrir navegación de notas" onClick={() => setDrawerOpen(true)}><Menu size={20} aria-hidden="true" /></button><span>Notas</span></div>
      <div className="notes-frame__sidebar">{renderSidebar()}</div>
      <main className="notes-frame__main">{editing ? <NoteEditor noteId={noteId ?? undefined} onBack={() => setEditing(false)} /> : <NoteLibrary searchQuery={searchQuery} folderId={folderId} tag={tag} onCreateNote={createNote} onOpenNote={openNote} />}</main>
      <Drawer open={drawerOpen} title="Navegación de notas" onClose={() => setDrawerOpen(false)}>{renderSidebar(() => setDrawerOpen(false))}</Drawer>
    </div>
  );
}