import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Note, NoteDraft, NotePatch } from "@/domain/note/models";
import type { NoteRepository } from "@/domain/note/ports";
import { useNoteEditor } from "./useNoteEditor";

describe("useNoteEditor", () => {
  it("does not create a note until the draft changes and keeps its title separate", async () => {
    const repository = createRepository();
    const { result } = renderHook(() => useNoteEditor(undefined, repository));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(repository.create).not.toHaveBeenCalled();

    act(() => result.current.setTitle("Título independiente"));
    await act(async () => { expect(await result.current.flush()).toBe(true); });

    expect(repository.create).toHaveBeenCalledWith({ folderId: null, title: "Título independiente", blocks: [], pinned: false });
    expect(result.current.blocks).toEqual([]);
    expect(result.current.note?.title).toBe("Título independiente");
  });

  it("accepts document snapshots without adding one undo entry per editor update", async () => {
    const repository = createRepository();
    const { result } = renderHook(() => useNoteEditor(undefined, repository));

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.replaceBlocks([{ id: "block-1", type: "paragraph", spans: [{ text: "Texto" }] }]));

    expect(result.current.blocks).toEqual([{ id: "block-1", type: "paragraph", spans: [{ text: "Texto" }] }]);
    expect(result.current.canUndo).toBe(false);
    await act(async () => { expect(await result.current.flush()).toBe(true); });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ blocks: result.current.blocks }));
  });

  it("retains failed changes and retries them when requested", async () => {
    const repository = createRepository();
    repository.create.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useNoteEditor(undefined, repository));

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setTitle("Se conserva"));
    await act(async () => { expect(await result.current.flush()).toBe(false); });

    expect(result.current.saveStatus).toBe("error");
    await act(async () => { expect(await result.current.flush()).toBe(true); });
    expect(result.current.note?.title).toBe("Se conserva");
    expect(result.current.saveStatus).toBe("saved");
  });

  it("persists a title update without replacing existing body blocks", async () => {
    const repository = createRepository();
    const note = await repository.create({
      folderId: null,
      title: "Anterior",
      blocks: [{ id: "block-1", type: "paragraph", spans: [{ text: "Cuerpo" }] }],
    });
    const { result } = renderHook(() => useNoteEditor(note.id, repository));

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setTitle("Nuevo"));
    await act(async () => { expect(await result.current.flush()).toBe(true); });

    expect(repository.update).toHaveBeenCalledWith(note.id, { title: "Nuevo" });
    expect(result.current.blocks).toEqual(note.blocks);
  });

  it("hides and normalizes a legacy first heading that duplicates the title", async () => {
    const repository = createRepository();
    const blocks = [
      { id: "legacy-title", type: "heading" as const, level: 1 as const, spans: [{ text: "Título heredado" }] },
      { id: "body", type: "paragraph" as const, spans: [{ text: "Contenido" }] },
    ];
    const note = await repository.create({ folderId: null, title: "Título heredado", blocks });
    const { result } = renderHook(() => useNoteEditor(note.id, repository));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.blocks).toEqual([blocks[1]]);

    act(() => result.current.setPinned(true));
    await act(async () => { expect(await result.current.flush()).toBe(true); });

    expect(repository.update).toHaveBeenCalledWith(note.id, { pinned: true, blocks: [blocks[1]] });
  });
});

function createRepository() {
  let stored: Note | null = null;
  const repository: NoteRepository & { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } = {
    findAll: vi.fn(async () => stored ? [stored] : []),
    findById: vi.fn(async (id: string) => stored?.id === id ? stored : null),
    search: vi.fn(async () => stored ? [stored] : []),
    create: vi.fn(async (draft: NoteDraft) => {
      stored = {
        id: "note-1",
        folderId: draft.folderId,
        title: draft.title ?? "",
        blocks: draft.blocks ?? [],
        tags: [],
        pinned: draft.pinned ?? false,
        archivedAt: null,
        deletedAt: null,
        createdAt: "2026-09-25T10:00:00.000Z",
        updatedAt: "2026-09-25T10:00:00.000Z",
      };
      return stored;
    }),
    update: vi.fn(async (_id: string, patch: NotePatch) => {
      if (!stored) throw new Error("Nota inexistente");
      stored = { ...stored, ...patch };
      return stored;
    }),
    softDelete: vi.fn(async () => undefined),
    restore: vi.fn(async () => undefined),
  };
  return repository;
}