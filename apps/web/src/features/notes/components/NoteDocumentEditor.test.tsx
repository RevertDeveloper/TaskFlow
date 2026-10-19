import type { Editor as TiptapEditor } from "@tiptap/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BlockNode } from "@/domain/note/models";
import { NoteDocumentEditor } from "./NoteDocumentEditor";

afterEach(cleanup);

describe("NoteDocumentEditor", () => {
  it("removes a blank task when focus leaves the visual document", async () => {
    const onBlocksChange = vi.fn();
    render(<NoteDocumentEditor blocks={[checklistBlock(true)]} onBlocksChange={onBlocksChange} onEditorReady={() => undefined} onSourceValidityChange={() => undefined} />);

    await screen.findByRole("textbox", { name: "Cuerpo de la nota" });
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));

    await waitFor(() => expect(onBlocksChange).toHaveBeenCalled());
    const savedBlocks = onBlocksChange.mock.calls.at(-1)?.[0] as BlockNode[];
    expect(savedBlocks).toMatchObject([{ type: "checklist", items: [{ spans: [{ text: "Preparar demo" }] }] }]);
    expect(JSON.stringify(savedBlocks)).not.toContain("tarea vacía");
  });

  it("deletes the selected checklist without saving an empty paragraph", async () => {
    const onBlocksChange = vi.fn();
    let editor: TiptapEditor | null = null;
    render(<NoteDocumentEditor blocks={[checklistBlock(false)]} onBlocksChange={onBlocksChange} onEditorReady={(value) => { editor = value; }} onSourceValidityChange={() => undefined} />);

    await waitFor(() => expect(editor).not.toBeNull());
    act(() => {
      let taskPosition = -1;
      editor?.state.doc.descendants((node, position) => {
        if (node.type.name === "taskItem") taskPosition = position;
      });
      editor?.commands.setTextSelection(taskPosition + 2);
    });
    const deleteButton = await screen.findByRole("button", { name: "Eliminar checklist" });
    fireEvent.click(deleteButton);

    await waitFor(() => expect(onBlocksChange).toHaveBeenCalled());
    const savedBlocks = onBlocksChange.mock.calls.at(-1)?.[0] as BlockNode[];
    expect(savedBlocks.some((block) => block.type === "checklist")).toBe(false);
    expect(savedBlocks).toEqual([]);
  });

  it("preserves unsupported Markdown without publishing an invalid document", async () => {
    const onBlocksChange = vi.fn();
    const onSourceValidityChange = vi.fn();
    const initialBlocks: BlockNode[] = [{ id: "00000000-0000-4000-8000-000000000004", type: "paragraph", spans: [{ text: "Documento válido" }] }];
    render(<NoteDocumentEditor blocks={initialBlocks} onBlocksChange={onBlocksChange} onEditorReady={() => undefined} onSourceValidityChange={onSourceValidityChange} />);

    await screen.findByRole("textbox", { name: "Cuerpo de la nota" });
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    const source = await screen.findByRole("textbox", { name: "Fuente Markdown de la nota" });
    fireEvent.change(source, { target: { value: "- lista no compatible" } });

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(onSourceValidityChange).toHaveBeenLastCalledWith(false);
    expect(onBlocksChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Visual" }));
    expect(screen.getByRole("textbox", { name: "Fuente Markdown de la nota" })).toHaveValue("- lista no compatible");
  });

  it("round-trips a Markdown source edit into the visual document", async () => {
    const onBlocksChange = vi.fn();
    render(<NoteDocumentEditor blocks={[]} onBlocksChange={onBlocksChange} onEditorReady={() => undefined} onSourceValidityChange={() => undefined} />);

    await screen.findByRole("textbox", { name: "Cuerpo de la nota" });
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    const source = await screen.findByRole("textbox", { name: "Fuente Markdown de la nota" });
    fireEvent.change(source, { target: { value: "# Plan\n\n- [ ] Preparar demo" } });
    fireEvent.click(screen.getByRole("button", { name: "Visual" }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Cuerpo de la nota" })).toHaveTextContent("Plan"));
    expect(onBlocksChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ type: "heading", level: 1 }),
      expect.objectContaining({ type: "checklist", items: [expect.objectContaining({ status: "pending" })] }),
    ]));
  });
});

function checklistBlock(includeBlank: boolean): BlockNode {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    type: "checklist",
    autoSort: true,
    items: [
      ...(includeBlank ? [{ id: "00000000-0000-4000-8000-000000000002", spans: [{ text: "   " }], status: "pending" as const, completedAt: null, indentLevel: 0, position: 0, children: [] }] : []),
      { id: "00000000-0000-4000-8000-000000000003", spans: [{ text: "Preparar demo" }], status: "pending", completedAt: null, indentLevel: 0, position: includeBlank ? 1 : 0, children: [] },
    ],
  };
}