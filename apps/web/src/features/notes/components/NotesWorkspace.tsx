"use client";

import { Menu } from "lucide-react";
import { useEffect, useState } from "react";

import { Drawer } from "@/components/ui/Drawer";
import { NoteEditor } from "./NoteEditor";
import { NoteLibrary } from "./NoteLibrary";
import { NoteSidebar } from "./NoteSidebar";
import { ProfileSettings } from "./ProfileSettings";

export function NotesWorkspace() {
  const [searchQuery, setSearchQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      const target = event.target;
      const isEditingText = target instanceof HTMLElement
        && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (modifier && event.key.toLowerCase() === "n" && !isEditingText) { event.preventDefault(); setEditing(true); }
      if (modifier && event.key.toLowerCase() === "k") { event.preventDefault(); document.querySelector<HTMLInputElement>(".notes-search input")?.focus(); }
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  function createNote() { setProfileOpen(false); setNoteId(null); setEditing(true); setDrawerOpen(false); }
  function openNote(id: string) { setProfileOpen(false); setNoteId(id); setEditing(true); setDrawerOpen(false); }
  function openProfile() { setEditing(false); setProfileOpen(true); }
  function renderSidebar(close?: () => void) { return <NoteSidebar searchQuery={searchQuery} onSearchChange={setSearchQuery} onCreateNote={createNote} onOpenProfile={openProfile} onClose={close} activeFolderId={folderId} activeTag={tag} onFolderChange={setFolderId} onTagChange={setTag} />; }

  return (
    <div className="notes-frame">
      <div className="notes-mobile-header"><button className="icon-button" type="button" aria-label="Abrir navegación de notas" onClick={() => setDrawerOpen(true)}><Menu size={20} aria-hidden="true" /></button><span>Notas</span></div>
      <div className="notes-frame__sidebar">{renderSidebar()}</div>
      <main className="notes-frame__main">{profileOpen ? <ProfileSettings onBack={() => setProfileOpen(false)} /> : editing ? <NoteEditor key={noteId ?? "new-note"} noteId={noteId ?? undefined} initialFolderId={noteId ? null : folderId} onBack={() => setEditing(false)} /> : <NoteLibrary searchQuery={searchQuery} folderId={folderId} tag={tag} onCreateNote={createNote} onOpenNote={openNote} />}</main>
      <Drawer open={drawerOpen} title="Navegación de notas" onClose={() => setDrawerOpen(false)}>{renderSidebar(() => setDrawerOpen(false))}</Drawer>
    </div>
  );
}