import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import type { BlockNode } from "@/domain/note/models";
import { blocksToEditorDocument, createNoteEditorExtensions, documentToBlocks, parseNoteMarkdown } from "./noteDocument";

const editors: Editor[] = [];

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe("note document adapter", () => {
  it("round-trips supported blocks and metadata through Markdown", () => {
    const blocks: BlockNode[] = [
      { id: uuid(1), type: "heading", level: 2, spans: [{ text: "Plan" }], collapsed: true },
      {
        id: uuid(2), type: "paragraph", spans: [
          { text: "TaskFlow", format: { bold: true, italic: true } },
          { text: " " },
          { text: "guide", format: { highlight: "mint" } },
          { text: " " },
          { text: "web", format: { link: "https://example.com" } },
        ],
      },
      {
        id: uuid(3), type: "checklist", autoSort: true, items: [
          { id: uuid(4), spans: [{ text: "Preparar demo" }], status: "pending", completedAt: null, indentLevel: 0, position: 0, children: [] },
          { id: uuid(5), spans: [{ text: "Revisar" }], status: "completed", completedAt: "2026-09-25T10:00:00.000Z", indentLevel: 1, position: 1, children: [] },
        ],
      },
      { id: uuid(6), type: "code", language: "ts", text: "const ready = true;" },
      { id: uuid(7), type: "divider" },
    ];
    const editor = createEditor(blocksToEditorDocument(blocks));
    const markdown = editor.getMarkdown();
    const expected = blocks.filter((block) => block.type !== "divider");

    expect(markdown).toContain("## Plan");
    expect(markdown).toContain("=={mint}guide==");
    expect(markdown).toContain("- [ ] Preparar demo");
    expect(markdown).toContain("- [x] Revisar");
    expect(parseNoteMarkdown(markdown, editor, expected)).toEqual(expected);
  });

  it("rejects Markdown blocks the note model cannot faithfully store", () => {
    const editor = createEditor({ type: "doc", content: [{ type: "paragraph" }] });

    expect(() => parseNoteMarkdown("- Lista normal", editor)).toThrow("listas con viñetas");
  });

  it("keeps unsafe link text but never turns it into an active link", () => {
    const editor = createEditor({ type: "doc", content: [{ type: "paragraph" }] });
    const blocks = parseNoteMarkdown("[texto](javascript:alert(1))", editor);

    expect(blocks).toMatchObject([{ type: "paragraph", spans: [{ text: "texto" }] }]);
    expect(JSON.stringify(blocks)).not.toContain("javascript:");
  });
});

function createEditor(content: ReturnType<typeof blocksToEditorDocument>): Editor {
  const editor = new Editor({ extensions: createNoteEditorExtensions(), content });
  editors.push(editor);
  return editor;
}

function uuid(number: number): string {
  return `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
}