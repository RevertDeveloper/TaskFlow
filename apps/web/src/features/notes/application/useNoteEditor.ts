"use client";

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BlockNode, ChecklistItem, Note, NotePatch } from "@/domain/note/models";
import type { NoteRepository } from "@/domain/note/ports";
import { IndexedDbNoteRepository } from "@/infrastructure/indexeddb/IndexedDbNoteRepository";
import { expandAllSections, setSectionsCollapsed } from "./sections";

const MAX_UNDO = 50;
const defaultNoteRepository = new IndexedDbNoteRepository();

type BlockOperation =
  | { type: "replace"; block: BlockNode }
  | { type: "checklist"; blockId: string; items: ChecklistItem[] }
  | { type: "insert"; block: BlockNode; afterId?: string };

type EditorSnapshot = {
  title: string;
  blocks: BlockNode[];
  folderId: string | null;
  pinned: boolean;
};

export type NoteSaveStatus = "loading" | "idle" | "pending" | "saving" | "saved" | "error";

type NoteEditorState = {
  note: Note | null;
  title: string;
  blocks: BlockNode[];
  folderId: string | null;
  pinned: boolean;
  saveStatus: NoteSaveStatus;
  saveError: string | null;
  loading: boolean;
  canUndo: boolean;
  setTitle: (title: string) => void;
  setFolderId: (folderId: string | null) => void;
  setPinned: (pinned: boolean) => void;
  flush: () => Promise<boolean>;
  discard: () => void;
  deleteCurrent: () => Promise<boolean>;
  applyBlockOp: (operation: BlockOperation) => void;
  replaceBlocks: (blocks: BlockNode[]) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLElement>, blockId?: string, itemId?: string) => void;
  undo: () => void;
};

export function useNoteEditor(noteId?: string, repository: NoteRepository = defaultNoteRepository, initialFolderId: string | null = null): NoteEditorState {
  const [note, setNote] = useState<Note | null>(null);
  const [draft, setDraft] = useState<EditorSnapshot>(() => emptySnapshot(initialFolderId));
  const [loading, setLoading] = useState(Boolean(noteId));
  const [saveStatus, setSaveStatus] = useState<NoteSaveStatus>(noteId ? "loading" : "idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const noteRef = useRef<Note | null>(null);
  const draftRef = useRef(draft);
  const pendingPatch = useRef<NotePatch>({});
  const undoStack = useRef<EditorSnapshot[]>([]);
  const hasLegacyTitleBlock = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSave = useRef<Promise<boolean> | null>(null);
  const flushRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));
  const discardRef = useRef(false);

  const publishDraft = useCallback((next: EditorSnapshot) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const scheduleSave = useCallback(() => {
    setSaveStatus("pending");
    setSaveError(null);
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushRef.current(); }, 500);
  }, []);

  const commitDraft = useCallback((next: EditorSnapshot, patch: NotePatch, recordUndo = true) => {
    if (recordUndo) {
      undoStack.current = [...undoStack.current, draftRef.current].slice(-MAX_UNDO);
      setUndoCount(undoStack.current.length);
    }
    publishDraft(next);
    const normalizedPatch = hasLegacyTitleBlock.current ? { ...patch, blocks: next.blocks } : patch;
    hasLegacyTitleBlock.current = false;
    pendingPatch.current = { ...pendingPatch.current, ...normalizedPatch };
    scheduleSave();
  }, [publishDraft, scheduleSave]);

  useEffect(() => {
    let cancelled = false;
    discardRef.current = false;
    pendingPatch.current = {};
    undoStack.current = [];
    hasLegacyTitleBlock.current = false;
    if (!noteId) {
      noteRef.current = null;
      return () => { cancelled = true; };
    }
    void repository.findById(noteId).then((loaded) => {
      if (cancelled) return;
      if (!loaded) throw new Error("No se encontró la nota solicitada.");
      noteRef.current = loaded;
      setNote(loaded);
      const firstBlock = loaded.blocks[0];
      const isLegacyTitleBlock = firstBlock?.type === "heading"
        && firstBlock.spans.map((span) => span.text).join("").trim() === loaded.title.trim();
      hasLegacyTitleBlock.current = isLegacyTitleBlock;
      publishDraft({
        title: loaded.title,
        blocks: isLegacyTitleBlock ? loaded.blocks.slice(1) : loaded.blocks,
        folderId: loaded.folderId,
        pinned: loaded.pinned,
      });
      setLoading(false);
      setSaveStatus("saved");
    }).catch((error: unknown) => {
      if (cancelled) return;
      setSaveError(errorMessage(error));
      setLoading(false);
      setSaveStatus("error");
    });
    return () => { cancelled = true; };
  }, [noteId, publishDraft, repository]);

  const flush = useCallback((): Promise<boolean> => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (activeSave.current) return activeSave.current;
    const run = async () => {
      while (Object.keys(pendingPatch.current).length > 0) {
        const patch = pendingPatch.current;
        pendingPatch.current = {};
        setSaveStatus("saving");
        try {
          const current = noteRef.current;
          const saved = current
            ? await repository.update(current.id, patch)
            : await repository.create({
                folderId: draftRef.current.folderId,
                title: draftRef.current.title,
                blocks: draftRef.current.blocks,
                pinned: draftRef.current.pinned,
              });
          noteRef.current = saved;
          setNote(saved);
        } catch (error) {
          pendingPatch.current = { ...patch, ...pendingPatch.current };
          setSaveError(errorMessage(error));
          setSaveStatus("error");
          return false;
        }
      }
      setSaveError(null);
      setSaveStatus(noteRef.current ? "saved" : "idle");
      return true;
    };
    const saving = run();
    activeSave.current = saving;
    void saving.finally(() => { activeSave.current = null; });
    return saving;
  }, [repository]);
  useEffect(() => { flushRef.current = flush; }, [flush]);

  useEffect(() => () => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    if (!discardRef.current) void flushRef.current();
  }, []);

  const setTitle = useCallback((title: string) => {
    const current = draftRef.current;
    if (title === current.title) return;
    commitDraft({ ...current, title }, { title });
  }, [commitDraft]);

  const setFolderId = useCallback((folderId: string | null) => {
    const current = draftRef.current;
    if (folderId === current.folderId) return;
    commitDraft({ ...current, folderId }, { folderId });
  }, [commitDraft]);

  const setPinned = useCallback((pinned: boolean) => {
    const current = draftRef.current;
    if (pinned === current.pinned) return;
    commitDraft({ ...current, pinned }, { pinned });
  }, [commitDraft]);

  const discard = useCallback(() => {
    discardRef.current = true;
    pendingPatch.current = {};
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, []);

  const deleteCurrent = useCallback(async () => {
    if (!(await flush())) return false;
    const current = noteRef.current;
    if (current) await repository.softDelete(current.id);
    discard();
    return true;
  }, [discard, flush, repository]);

  const applyBlockOp = useCallback((operation: BlockOperation) => {
    const current = draftRef.current;
    let blocks: BlockNode[];
    if (operation.type === "replace") {
      blocks = current.blocks.map((block) => block.id === operation.block.id ? operation.block : block);
    } else if (operation.type === "checklist") {
      blocks = current.blocks.map((block) => block.id === operation.blockId && block.type === "checklist" ? { ...block, items: operation.items } : block);
    } else {
      const index = operation.afterId ? current.blocks.findIndex((block) => block.id === operation.afterId) + 1 : current.blocks.length;
      blocks = [...current.blocks.slice(0, index), operation.block, ...current.blocks.slice(index)];
    }
    commitDraft({ ...current, blocks }, { blocks });
  }, [commitDraft]);

  const replaceBlocks = useCallback((blocks: BlockNode[]) => {
    const current = draftRef.current;
    if (JSON.stringify(current.blocks) === JSON.stringify(blocks)) return;
    commitDraft({ ...current, blocks }, { blocks }, false);
  }, [commitDraft]);

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    setUndoCount(undoStack.current.length);
    publishDraft(previous);
    pendingPatch.current = {
      ...pendingPatch.current,
      title: previous.title,
      blocks: previous.blocks,
      folderId: previous.folderId,
      pinned: previous.pinned,
    };
    scheduleSave();
  }, [publishDraft, scheduleSave]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.altKey && ["1", "2"].includes(event.key)) {
      event.preventDefault();
      const level = Number(event.key) as 1 | 2;
      const blocks = setSectionsCollapsed(draftRef.current.blocks, level, true);
      commitDraft({ ...draftRef.current, blocks }, { blocks });
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.altKey && event.key === "0") {
      event.preventDefault();
      const blocks = expandAllSections(draftRef.current.blocks);
      commitDraft({ ...draftRef.current, blocks }, { blocks });
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }
  }, [commitDraft, undo]);

  return {
    note,
    title: draft.title,
    blocks: draft.blocks,
    folderId: draft.folderId,
    pinned: draft.pinned,
    saveStatus,
    saveError,
    loading,
    canUndo: undoCount > 0,
    setTitle,
    setFolderId,
    setPinned,
    flush,
    discard,
    deleteCurrent,
    applyBlockOp,
    replaceBlocks,
    handleKeyDown,
    undo,
  };
}

function emptySnapshot(folderId: string | null): EditorSnapshot {
  return { title: "", blocks: [], folderId, pinned: false };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo guardar la nota.";
}
