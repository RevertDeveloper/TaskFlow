"use client";

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BlockNode, ChecklistItem, Note, NotePatch } from "@/domain/note/models";
import { IndexedDbNoteRepository } from "@/infrastructure/indexeddb/IndexedDbNoteRepository";
import { expandAllSections, setSectionsCollapsed } from "./sections";

const MAX_UNDO = 50;
const defaultNoteRepository = new IndexedDbNoteRepository();

type BlockOperation =
  | { type: "replace"; block: BlockNode }
  | { type: "checklist"; blockId: string; items: ChecklistItem[] }
  | { type: "insert"; block: BlockNode; afterId?: string };

type NoteEditorState = {
  note: Note | null;
  blocks: BlockNode[];
  draftPatch: NotePatch;
  loading: boolean;
  save: () => void;
  applyBlockOp: (operation: BlockOperation) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLElement>, blockId?: string, itemId?: string) => void;
  undo: () => void;
};

export function useNoteEditor(noteId?: string, repository = defaultNoteRepository): NoteEditorState {
  const [note, setNote] = useState<Note | null>(null);
  const [blocks, setBlocks] = useState<BlockNode[]>([]);
  const [draftPatch, setDraftPatch] = useState<NotePatch>({});
  const [loading, setLoading] = useState(true);
  const undoStack = useRef<BlockNode[][]>([]);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (noteId ? repository.findById(noteId) : repository.create({ folderId: null })).then((loaded) => {
      if (cancelled || !loaded) return;
      setNote(loaded);
      setBlocks(loaded.blocks);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [noteId, repository]);

  const save = useCallback(() => {
    if (!note || Object.keys(draftPatch).length === 0) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void repository.update(note.id, draftPatch).then((updated) => {
        setNote(updated);
        setBlocks(updated.blocks);
        setDraftPatch({});
      }).catch(() => undefined);
    }, 500);
  }, [draftPatch, note, repository]);

  useEffect(() => {
    save();
    return () => { if (saveTimer.current !== null) window.clearTimeout(saveTimer.current); };
  }, [save]);

  const applyBlockOp = useCallback((operation: BlockOperation) => {
    setBlocks((current) => {
      undoStack.current = [...undoStack.current, current].slice(-MAX_UNDO);
      let next: BlockNode[];
      if (operation.type === "replace") {
        next = current.map((block) => block.id === operation.block.id ? operation.block : block);
      } else if (operation.type === "checklist") {
        next = current.map((block) => block.id === operation.blockId && block.type === "checklist" ? { ...block, items: operation.items } : block);
      } else {
        const index = operation.afterId ? current.findIndex((block) => block.id === operation.afterId) + 1 : current.length;
        next = [...current.slice(0, index), operation.block, ...current.slice(index)];
      }
      setDraftPatch((patch) => ({ ...patch, blocks: next }));
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    setBlocks(previous);
    setDraftPatch((patch) => ({ ...patch, blocks: previous }));
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.altKey && ["1", "2"].includes(event.key)) {
      event.preventDefault();
      const level = Number(event.key) as 1 | 2;
      setBlocks((current) => {
        const next = setSectionsCollapsed(current, level, true);
        setDraftPatch((patch) => ({ ...patch, blocks: next }));
        return next;
      });
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.altKey && event.key === "0") {
      event.preventDefault();
      setBlocks((current) => {
        const next = expandAllSections(current);
        setDraftPatch((patch) => ({ ...patch, blocks: next }));
        return next;
      });
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }
  }, [undo]);

  return { note, blocks, draftPatch, loading, save, applyBlockOp, handleKeyDown, undo };
}
