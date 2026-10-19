"use client";

import { ArrowLeft, Bookmark, FolderOpen, MoreHorizontal, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Editor as TiptapEditor } from "@tiptap/core";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { Folder } from "@/domain/folder/models";
import { IndexedDbFolderRepository } from "@/infrastructure/indexeddb/IndexedDbFolderRepository";
import { useNoteEditor } from "../application/useNoteEditor";
import { NoteDocumentEditor } from "./NoteDocumentEditor";

type NoteEditorProps = { noteId?: string; initialFolderId?: string | null; onBack: () => void };

const folderRepository = new IndexedDbFolderRepository();

export function NoteEditor({ noteId, initialFolderId = null, onBack }: NoteEditorProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bodyEditor, setBodyEditor] = useState<TiptapEditor | null>(null);
  const [sourceValid, setSourceValid] = useState(true);
  const [folders, setFolders] = useState<Folder[]>([]);
  const editor = useNoteEditor(noteId, undefined, initialFolderId);

  useEffect(() => {
    if (!editor.loading && window.matchMedia?.("(pointer: fine)").matches) titleRef.current?.focus();
  }, [editor.loading]);

  useEffect(() => {
    let cancelled = false;
    void folderRepository.findAll().then((loaded) => { if (!cancelled) setFolders(loaded); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function backToLibrary() {
    if (!sourceValid) return;
    if (await editor.flush()) onBack();
  }

  async function confirmDelete() {
    setDeleteError(null);
    try {
      if (await editor.deleteCurrent()) {
        setDeleteDialogOpen(false);
        onBack();
      } else {
        setDeleteError(editor.saveError ?? "No se pudo guardar la nota antes de eliminarla.");
      }
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "No se pudo eliminar la nota.");
    }
  }

  const saveMessage = {
    loading: "Cargando…",
    idle: "Borrador sin cambios",
    pending: "Cambios pendientes…",
    saving: "Guardando…",
    saved: "Guardado localmente",
    error: "Error al guardar · Reintentar",
  }[editor.saveStatus];

  return (
    <section className="note-editor" aria-label="Editor de nota">
      <div className="note-editor__sticky-tools">
        <header className="note-editor__toolbar" role="toolbar" aria-label="Acciones de la nota">
          <div className="note-editor__toolbar-leading">
            <button className="icon-button" type="button" aria-label="Volver a notas" disabled={!sourceValid} onClick={() => { void backToLibrary(); }}><ArrowLeft size={20} aria-hidden="true" /></button>
            <span className={`note-editor__status${editor.saveStatus === "error" ? " note-editor__status--error" : ""}`} aria-live="polite">
              {editor.saveStatus === "error"
                ? <button type="button" onClick={() => { void editor.flush(); }}>{saveMessage}</button>
                : saveMessage}
            </span>
          </div>
          <div className="note-editor__toolbar-actions">
            <button className="icon-button" type="button" aria-label="Deshacer" disabled={!editor.canUndo && !bodyEditor?.can().undo()} onClick={() => {
              if (bodyEditor?.isFocused && bodyEditor.can().undo()) bodyEditor.commands.undo();
              else editor.undo();
            }}><Undo2 size={18} aria-hidden="true" /></button>
            <div className="note-editor__popover" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOptionsOpen(false);
        }} onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOptionsOpen(false);
            menuTriggerRef.current?.focus();
          }
        }}>
              <button ref={menuTriggerRef} className="icon-button" type="button" aria-label="Más opciones" aria-expanded={optionsOpen} aria-controls="note-editor-note-options" disabled={editor.loading} onClick={() => setOptionsOpen((open) => !open)}><MoreHorizontal size={20} aria-hidden="true" /></button>
              {optionsOpen ? <div className="note-editor__menu-panel note-editor__menu-panel--wide" id="note-editor-note-options" aria-label="Opciones de la nota">
                <button type="button" onClick={() => { editor.setPinned(!editor.pinned); setOptionsOpen(false); }}><Bookmark size={17} aria-hidden="true" /> {editor.pinned ? "Quitar de fijadas" : "Fijar nota"}</button>
                <label className="note-editor__folder-field" htmlFor="note-editor-folder"><FolderOpen size={17} aria-hidden="true" /> Mover a carpeta</label>
                <select id="note-editor-folder" value={editor.folderId ?? ""} onChange={(event) => { editor.setFolderId(event.target.value || null); setOptionsOpen(false); }}>
                  <option value="">Sin carpeta</option>
                  {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
                </select>
                <button className="note-editor__delete-action" type="button" onClick={() => { setOptionsOpen(false); setDeleteDialogOpen(true); }}><Trash2 size={17} aria-hidden="true" /> Eliminar nota</button>
              </div> : null}
            </div>
          </div>
        </header>
      </div>
      {editor.saveStatus === "error" && editor.saveError ? <p className="note-editor__error" role="alert">{editor.saveError}</p> : null}
      <div className="note-editor__canvas" onKeyDown={(event) => {
        const target = event.target;
        if (target instanceof HTMLElement && (target.closest(".ProseMirror") || target.matches("textarea"))) return;
        editor.handleKeyDown(event);
      }}>
        <input ref={titleRef} className="note-editor__title" id="note-editor-title" name="note-title" maxLength={500} autoComplete="off" disabled={editor.loading} value={editor.title} onChange={(event) => editor.setTitle(event.target.value)} placeholder="Título de la nota…" aria-label="Título de la nota" />
        {editor.loading ? <p className="note-editor__loading" role="status">Cargando nota…</p> : null}
        {!editor.loading ? <NoteDocumentEditor key={noteId ?? "new-note"} blocks={editor.blocks} onBlocksChange={editor.replaceBlocks} onEditorReady={setBodyEditor} onSourceValidityChange={setSourceValid} /> : null}
      </div>
      <Modal open={deleteDialogOpen} title="Eliminar nota" onClose={() => { setDeleteDialogOpen(false); setDeleteError(null); }}>
        <div className="confirm-dialog">
          <p>La nota se eliminará de este dispositivo y de los dispositivos sincronizados. Esta acción no se puede deshacer.</p>
          {deleteError ? <p role="alert" className="note-editor__error">{deleteError}</p> : null}
          <div className="editor-form__actions">
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="danger" onClick={() => { void confirmDelete(); }}>Eliminar nota</Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}