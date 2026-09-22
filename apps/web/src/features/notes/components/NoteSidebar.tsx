"use client";

import { FileText, Folder, Plus, Search, Tag } from "lucide-react";
import { useState } from "react";

type NoteSidebarProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateNote: () => void;
  onClose?: () => void;
};

export function NoteSidebar({ searchQuery, onSearchChange, onCreateNote, onClose }: NoteSidebarProps) {
  const [activeFolder, setActiveFolder] = useState("all");

  function selectFolder(folderId: string) {
    setActiveFolder(folderId);
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
        <button className="folder-node" type="button" role="treeitem" aria-selected={activeFolder === "all"} data-active={activeFolder === "all"} aria-expanded="true" onClick={() => selectFolder("all")}>
          <FileText size={17} aria-hidden="true" /><span>Todas las notas</span><small>0</small>
        </button>
        <div className="notes-sidebar__section-label">Carpetas</div>
        <button className="folder-node" type="button" role="treeitem" aria-selected={activeFolder === "personal"} data-active={activeFolder === "personal"} aria-expanded="true" onClick={() => selectFolder("personal")}>
          <Folder size={17} aria-hidden="true" /><span>Personal</span>
        </button>
        <button className="folder-node folder-node--nested" type="button" role="treeitem" aria-selected={activeFolder === "diario"} data-active={activeFolder === "diario"} aria-expanded="true" onClick={() => selectFolder("diario")}>
          <Folder size={16} aria-hidden="true" /><span>Diario</span>
        </button>
        <button className="folder-node" type="button" role="treeitem" aria-selected={activeFolder === "work"} data-active={activeFolder === "work"} aria-expanded="true" onClick={() => selectFolder("work")}>
          <Folder size={17} aria-hidden="true" /><span>Trabajo</span>
        </button>
      </nav>
      <div className="notes-sidebar__tags">
        <div className="notes-sidebar__section-label"><Tag size={14} aria-hidden="true" /> Etiquetas</div>
        <p className="notes-sidebar__empty">Tus etiquetas aparecerán aquí</p>
      </div>
      <button className="notes-sidebar__new-folder" type="button"> <Plus size={16} aria-hidden="true" /> Nueva carpeta</button>
    </aside>
  );
}