"use client";

import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { CheckSquare, Code2, FileCode2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { BlockNode, HighlightColor } from "@/domain/note/models";
import {
  blocksToEditorDocument,
  createNoteEditorExtensions,
  documentToBlocks,
  parseNoteMarkdown,
} from "../application/noteDocument";

type NoteDocumentEditorProps = {
  blocks: BlockNode[];
  onBlocksChange: (blocks: BlockNode[]) => void;
  onEditorReady: (editor: TiptapEditor | null) => void;
  onSourceValidityChange: (isValid: boolean) => void;
};

type EditorContext = { hasSelection: boolean; inTaskItem: boolean; inTaskList: boolean };
type EditorMode = "visual" | "markdown";
type SelectedEditorNode = {
  node: NonNullable<ReturnType<TiptapEditor["state"]["doc"]["nodeAt"]>>;
  position: number;
  depth: number;
};

const HIGHLIGHT_COLORS: HighlightColor[] = ["pink", "purple", "orange", "mint", "blue"];

export function NoteDocumentEditor({ blocks, onBlocksChange, onEditorReady, onSourceValidityChange }: NoteDocumentEditorProps) {
  const [initialDocument] = useState(() => blocksToEditorDocument(blocks));
  const [mode, setMode] = useState<EditorMode>("visual");
  const [markdown, setMarkdown] = useState("");
  const [markdownError, setMarkdownError] = useState<string | null>(null);
  const [markdownBlocks, setMarkdownBlocks] = useState<BlockNode[] | null>(null);
  const [context, setContext] = useState<EditorContext>({ hasSelection: false, inTaskItem: false, inTaskList: false });
  const latestBlocks = useRef(blocks);
  const callbacks = useRef({ onBlocksChange, onEditorReady, onSourceValidityChange });

  useEffect(() => {
    latestBlocks.current = blocks;
    callbacks.current = { onBlocksChange, onEditorReady, onSourceValidityChange };
  }, [blocks, onBlocksChange, onEditorReady, onSourceValidityChange]);

  const editor = useEditor({
    extensions: createNoteEditorExtensions(),
    content: initialDocument,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "note-document-editor__surface",
        role: "textbox",
        "aria-label": "Cuerpo de la nota",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextBlocks = documentToBlocks(currentEditor.getJSON(), latestBlocks.current);
      latestBlocks.current = nextBlocks;
      callbacks.current.onBlocksChange(nextBlocks);
    },
    onBlur: ({ editor: currentEditor }) => removeEmptyTaskItems(currentEditor),
  });

  useEffect(() => {
    if (!editor) return;
    const updateContext = () => setContext(selectionContext(editor));
    callbacks.current.onEditorReady(editor);
    editor.on("selectionUpdate", updateContext);
    editor.on("focus", updateContext);
    editor.on("blur", updateContext);
    updateContext();
    return () => {
      editor.off("selectionUpdate", updateContext);
      editor.off("focus", updateContext);
      editor.off("blur", updateContext);
      callbacks.current.onEditorReady(null);
    };
  }, [editor]);

  function enterMarkdownMode() {
    if (!editor) return;
    removeEmptyTaskItems(editor);
    setMarkdown(editor.getMarkdown());
    setMarkdownBlocks(latestBlocks.current);
    setMarkdownError(null);
    setMode("markdown");
    callbacks.current.onSourceValidityChange(true);
  }

  function enterVisualMode() {
    if (!editor || markdownError || !markdownBlocks) return;
    editor.commands.setContent(blocksToEditorDocument(markdownBlocks), { emitUpdate: false });
    latestBlocks.current = markdownBlocks;
    callbacks.current.onBlocksChange(markdownBlocks);
    setMode("visual");
    setMarkdownError(null);
    callbacks.current.onSourceValidityChange(true);
  }

  function changeMarkdown(value: string) {
    setMarkdown(value);
    if (!editor) return;
    try {
      const nextBlocks = parseNoteMarkdown(value, editor, latestBlocks.current);
      setMarkdownBlocks(nextBlocks);
      setMarkdownError(null);
      latestBlocks.current = nextBlocks;
      callbacks.current.onBlocksChange(nextBlocks);
      callbacks.current.onSourceValidityChange(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo interpretar el Markdown.";
      setMarkdownError(message);
      callbacks.current.onSourceValidityChange(false);
    }
  }

  function applyHighlight(color: HighlightColor) {
    editor?.chain().focus().setMark("taskflowHighlight", { color }).run();
  }

  return (
    <div className="note-document-editor">
      <div className="note-document-editor__toolbar" role="toolbar" aria-label="Formato del cuerpo">
        <div className="note-document-editor__actions">
          <button className="note-editor__insert-action" type="button" aria-label="Insertar checklist" disabled={!editor || mode !== "visual"} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
            <CheckSquare size={17} aria-hidden="true" /><span>Tareas</span>
          </button>
          <button className="note-editor__insert-action" type="button" aria-label="Insertar código" disabled={!editor || mode !== "visual"} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
            <Code2 size={17} aria-hidden="true" /><span>Código</span>
          </button>
          {mode === "visual" && context.inTaskItem ? <button className="note-editor__insert-action note-editor__insert-action--danger" type="button" aria-label="Eliminar tarea" onMouseDown={preserveEditorSelection} onClick={() => editor && deleteSelectedTask(editor)}>
            <Trash2 size={17} aria-hidden="true" /><span>Eliminar tarea</span>
          </button> : null}
          {mode === "visual" && context.inTaskList ? <button className="note-editor__insert-action note-editor__insert-action--danger" type="button" aria-label="Eliminar checklist" onMouseDown={preserveEditorSelection} onClick={() => editor && deleteSelectedTaskList(editor)}>
            <Trash2 size={17} aria-hidden="true" /><span>Eliminar checklist</span>
          </button> : null}
        </div>
        <div className="note-document-editor__mode" role="group" aria-label="Modo de edición">
          <button type="button" aria-pressed={mode === "visual"} onClick={enterVisualMode}><FileCode2 size={16} aria-hidden="true" /><span>Visual</span></button>
          <button type="button" aria-pressed={mode === "markdown"} onClick={enterMarkdownMode}><Code2 size={16} aria-hidden="true" /><span>Markdown</span></button>
        </div>
      </div>
      {mode === "visual" && context.hasSelection ? <div className="note-document-editor__formatting" role="toolbar" aria-label="Resaltado de selección">
        {HIGHLIGHT_COLORS.map((color) => <button className={`swatch swatch--${color}`} key={color} type="button" aria-label={`Resaltar en ${color}`} onMouseDown={preserveEditorSelection} onClick={() => applyHighlight(color)} />)}
      </div> : null}
      {mode === "visual" ? <EditorContent editor={editor} className="note-document-editor__content" /> : (
        <div className="note-document-editor__source-wrap">
          <textarea
            className="note-document-editor__source"
            value={markdown}
            aria-label="Fuente Markdown de la nota"
            spellCheck
            onChange={(event) => changeMarkdown(event.target.value)}
          />
          {markdownError ? <p className="note-document-editor__error" role="alert">{markdownError}</p> : null}
        </div>
      )}
    </div>
  );
}

function preserveEditorSelection(event: React.MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function selectionContext(editor: TiptapEditor): EditorContext {
  const { $from } = editor.state.selection;
  let inTaskItem = false;
  let inTaskList = false;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const type = $from.node(depth).type.name;
    if (type === "taskItem") inTaskItem = true;
    if (type === "taskList") inTaskList = true;
  }
  return { hasSelection: !editor.state.selection.empty, inTaskItem, inTaskList };
}

function deleteSelectedTask(editor: TiptapEditor) {
  const selected = findSelectedNode(editor, "taskItem");
  if (!selected) return;
  const { $from } = editor.state.selection;
  const listDepth = selected.depth - 1;
  const list = $from.node(listDepth);
  const listPosition = $from.before(listDepth);
  const outsideList = $from.node(listDepth - 1);
  const transaction = editor.state.tr;
  if (list.type.name === "taskList" && list.childCount === 1 && outsideList.type.name === "doc") {
    const paragraph = editor.state.schema.nodes.paragraph.create({ blockId: list.attrs.blockId ?? createUuid() });
    transaction.replaceWith(listPosition, listPosition + list.nodeSize, paragraph);
  } else {
    transaction.delete(selected.position, selected.position + selected.node.nodeSize);
  }
  editor.view.dispatch(transaction);
  editor.commands.setTextSelection(Math.min(selected.position + 1, editor.state.doc.content.size));
}

function deleteSelectedTaskList(editor: TiptapEditor) {
  const selected = findSelectedNode(editor, "taskList");
  if (!selected) return;
  const $from = editor.state.selection.$from;
  const outsideList = $from.node(selected.depth - 1);
  const transaction = editor.state.tr;
  if (outsideList.type.name === "doc") {
    const paragraph = editor.state.schema.nodes.paragraph.create({ blockId: selected.node.attrs.blockId ?? createUuid() });
    transaction.replaceWith(selected.position, selected.position + selected.node.nodeSize, paragraph);
  } else {
    transaction.delete(selected.position, selected.position + selected.node.nodeSize);
  }
  editor.view.dispatch(transaction);
  editor.commands.setTextSelection(Math.min(selected.position + 1, editor.state.doc.content.size));
}

function findSelectedNode(editor: TiptapEditor, type: "taskItem" | "taskList"): SelectedEditorNode | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== type) continue;
    return { node: $from.node(depth), position: $from.before(depth), depth };
  }
  return null;
}

function removeEmptyTaskItems(editor: TiptapEditor) {
  const current = editor.getJSON();
  const next = cleanTaskDocument(current);
  if (JSON.stringify(current) !== JSON.stringify(next)) editor.commands.setContent(next, { emitUpdate: true });
}

function cleanTaskDocument(document: JSONContent): JSONContent {
  const content = (document.content ?? []).flatMap((node): JSONContent[] => {
    if (node.type !== "taskList") return [node];
    const cleaned = cleanTaskList(node);
    if ((cleaned.content?.length ?? 0) > 0) return [cleaned];
    return [{ type: "paragraph", attrs: { blockId: node.attrs?.blockId ?? createUuid() }, content: [] }];
  });
  return { ...document, content };
}

function cleanTaskList(list: JSONContent): JSONContent {
  const content: JSONContent[] = [];
  for (const item of list.content ?? []) {
    if (item.type !== "taskItem") continue;
    const nestedLists = item.content?.filter((node) => node.type === "taskList") ?? [];
    const itemContent = item.content?.filter((node) => node.type !== "taskList") ?? [];
    const nestedItems = nestedLists.flatMap((nested) => cleanTaskList(nested).content ?? []);
    const text = itemContent.map(readText).join("");
    if (!text.trim()) {
      content.push(...nestedItems.map((child) => ({
        ...child,
        attrs: { ...child.attrs, indentLevel: Math.max(0, Number(child.attrs?.indentLevel ?? 0) - 1) },
      })));
      continue;
    }
    content.push({
      ...item,
      content: [...itemContent, ...(nestedItems.length > 0 ? [{ type: "taskList", content: nestedItems }] : [])],
    });
  }
  return { ...list, content };
}

function readText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(readText).join("");
}

function createUuid(): string {
  return crypto.randomUUID();
}