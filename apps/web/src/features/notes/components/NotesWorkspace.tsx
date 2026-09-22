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

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "n") { event.preventDefault(); setEditing(true); }
      if (modifier && event.key.toLowerCase() === "k") { event.preventDefault(); document.querySelector<HTMLInputElement>(".notes-search input")?.focus(); }
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  function createNote() { setEditing(true); setDrawerOpen(false); }

  return (
    <div className="notes-frame">
      <div className="notes-mobile-header"><button className="icon-button" type="button" aria-label="Abrir navegación de notas" onClick={() => setDrawerOpen(true)}><Menu size={20} aria-hidden="true" /></button><span>Notas</span></div>
      <div className="notes-frame__sidebar"><NoteSidebar searchQuery={searchQuery} onSearchChange={setSearchQuery} onCreateNote={createNote} /></div>
      <main className="notes-frame__main">{editing ? <NoteEditor onBack={() => setEditing(false)} /> : <NoteLibrary searchQuery={searchQuery} onCreateNote={createNote} />}</main>
      <Drawer open={drawerOpen} title="Navegación de notas" onClose={() => setDrawerOpen(false)}><NoteSidebar searchQuery={searchQuery} onSearchChange={setSearchQuery} onCreateNote={createNote} onClose={() => setDrawerOpen(false)} /></Drawer>
    </div>
  );
}