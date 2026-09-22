"use client";

import { FileText, Folder, Plus, Search, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Folder as NoteFolder } from "@/domain/folder/models";
import { IndexedDbFolderRepository } from "@/infrastructure/indexeddb/IndexedDbFolderRepository";
import { IndexedDbNoteRepository } from "@/infrastructure/indexeddb/IndexedDbNoteRepository";

type NoteSidebarProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateNote: () => void;
  activeFolderId?: string | null;
  activeTag?: string | null;
  onFolderChange?: (folderId: string | null) => void;
  onTagChange?: (tag: string | null) => void;
  onClose?: () => void;
};

const folderRepository = new IndexedDbFolderRepository();
const noteRepository = new IndexedDbNoteRepository();

export function NoteSidebar({ searchQuery, onSearchChange, onCreateNote, onClose, activeFolderId, activeTag, onFolderChange, onTagChange }: NoteSidebarProps) {
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    const load = () => void Promise.all([folderRepository.findAll(), noteRepository.findAll()]).then(([loadedFolders, notes]) => {
      setFolders(loadedFolders); setTags([...new Set(notes.flatMap((note) => note.tags))].sort());
    }).catch(() => undefined);
    load();
    window.addEventListener("taskflow:local-change", load);
    return () => window.removeEventListener("taskflow:local-change", load);
  }, []);

  function selectFolder(folderId: string) {
    onFolderChange?.(folderId === "all" ? null : folderId);
    onTagChange?.(null);
    onClose?.();
  }

  return (
    <aside className="notes-sidebar" aria-label="Navegación de notas">
      <div className="notes-sidebar__brand">
        <div>
          <span className="notes-sidebar__kicker">Archivo personal</span>
          <h1>Notas</h1>
        </div>
        <button className="icon-button" type="button" aria-label="Crear una nota" onClick={onCreateNote}>
          <Plus size={19} aria-hidden="true" />
        </button>
      </div>
      <label className="notes-search">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">Buscar notas</span>
        <input type="search" value={searchQuery} placeholder="Buscar notas" onChange={(event) => onSearchChange(event.target.value)} />
        <kbd>⌘K</kbd>
      </label>
      <nav className="notes-sidebar__nav" aria-label="Carpetas" role="tree">
        <button className="folder-node" type="button" role="treeitem" aria-selected={!activeFolderId} data-active={!activeFolderId} aria-expanded="true" onClick={() => selectFolder("all")}>
          <FileText size={17} aria-hidden="true" /><span>Todas las notas</span>
        </button>
        <div className="notes-sidebar__section-label">Carpetas</div>
        {buildFolderTree(folders).map((folder) => <FolderNode key={folder.id} folder={folder} activeFolderId={activeFolderId} onSelect={selectFolder} />)}
      </nav>
      <div className="notes-sidebar__tags">
        <div className="notes-sidebar__section-label"><Tag size={14} aria-hidden="true" /> Etiquetas</div>
        {tags.length ? <div className="notes-sidebar__tag-list">{tags.map((tag) => <button key={tag} className="tag-chip" type="button" data-active={activeTag === tag} onClick={() => { onTagChange?.(activeTag === tag ? null : tag); onFolderChange?.(null); onClose?.(); }}>#{tag}</button>)}</div> : <p className="notes-sidebar__empty">Tus etiquetas aparecerán aquí</p>}
      </div>
      <button className="notes-sidebar__new-folder" type="button" onClick={() => { const name = window.prompt("Nombre de la carpeta"); if (!name?.trim()) return; void folderRepository.create({ name, parentId: null, emoji: "" }).then((folder) => setFolders((current) => [...current, folder])); }}> <Plus size={16} aria-hidden="true" /> Nueva carpeta</button>
    </aside>
  );
}

type FolderTreeNode = NoteFolder & { children: FolderTreeNode[] };
function buildFolderTree(folders: NoteFolder[]): FolderTreeNode[] {
  const byParent = new Map<string | null, FolderTreeNode[]>();
  for (const folder of folders) {
    const list = byParent.get(folder.parentId) ?? [];
    list.push({ ...folder, children: [] }); byParent.set(folder.parentId, list);
  }
  function attach(parentId: string | null, depth = 0): FolderTreeNode[] {
    if (depth >= 5) return [];
    return (byParent.get(parentId) ?? []).sort((a, b) => a.position - b.position).map((folder) => ({ ...folder, children: attach(folder.id, depth + 1) }));
  }
  return attach(null);
}

function FolderNode({ folder, activeFolderId, onSelect, depth = 0 }: { folder: FolderTreeNode; activeFolderId?: string | null; onSelect: (id: string) => void; depth?: number }) {
  return <div><button className={`folder-node${depth ? " folder-node--nested" : ""}`} style={{ "--folder-depth": depth } as CSSProperties} type="button" role="treeitem" aria-selected={activeFolderId === folder.id} data-active={activeFolderId === folder.id} aria-expanded={folder.children.length > 0} onClick={() => onSelect(folder.id)}><Folder size={17} aria-hidden="true" /><span>{folder.emoji ? `${folder.emoji} ` : ""}{folder.name}</span></button>{folder.children.map((child) => <FolderNode key={child.id} folder={child} activeFolderId={activeFolderId} onSelect={onSelect} depth={depth + 1} />)}</div>;
}