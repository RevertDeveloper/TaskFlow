import { Extension, Mark, type Editor, type JSONContent, type MarkdownToken } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Link from "@tiptap/extension-link";
import { Markdown } from "@tiptap/markdown";
import { Placeholder } from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";

import type { BlockNode, ChecklistItem, HighlightColor, InlineFormat, InlineSpan } from "@/domain/note/models";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HIGHLIGHT_COLORS: HighlightColor[] = ["pink", "purple", "orange", "mint", "blue"];
const SUPPORTED_NODE_TYPES = new Set(["doc", "paragraph", "heading", "codeBlock", "taskList", "taskItem", "text", "hardBreak"]);
const SUPPORTED_MARK_TYPES = new Set(["bold", "italic", "code", "link", "taskflowHighlight"]);

export function createNoteEditorExtensions() {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      heading: { levels: [1, 2, 3] },
      horizontalRule: false,
      link: false,
      listItem: false,
      listKeymap: false,
      orderedList: false,
      strike: false,
      underline: false,
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
      a11y: { checkboxLabel: (node, checked) => `${checked ? "Marcar como pendiente" : "Marcar como completada"}: ${node.textContent || "tarea"}` },
    }),
    Link.configure({
      autolink: false,
      linkOnPaste: false,
      openOnClick: false,
      isAllowedUri: isSafeWebUrl,
      HTMLAttributes: { rel: "noopener noreferrer", target: null },
    }),
    TaskFlowHighlight,
    NoteMetadata,
    Placeholder.configure({
      placeholder: ({ node }) => node.type.name === "paragraph" ? "Empieza a escribir…" : "",
      includeChildren: false,
    }),
    Markdown.configure({ indentation: { style: "space", size: 2 }, markedOptions: { gfm: true } }),
  ];
}

export function blocksToEditorDocument(blocks: BlockNode[]): JSONContent {
  const content = blocks.flatMap((block): JSONContent[] => {
    if (block.type === "divider") return [];
    if (block.type === "paragraph") {
      return [{ type: "paragraph", attrs: { blockId: block.id }, content: spansToEditorContent(block.spans) }];
    }
    if (block.type === "heading") {
      return [{
        type: "heading",
        attrs: { blockId: block.id, level: block.level, collapsed: block.collapsed ?? false },
        content: spansToEditorContent(block.spans),
      }];
    }
    if (block.type === "code") {
      return [{
        type: "codeBlock",
        attrs: { blockId: block.id, language: block.language ?? null },
        content: block.text ? [{ type: "text", text: block.text }] : [],
      }];
    }
    const tree = checklistToTree(block.items);
    return tree.length > 0 ? [{
      type: "taskList",
      attrs: { blockId: block.id, autoSort: block.autoSort },
      content: tree.map((entry, position) => taskTreeToEditorNode(entry, position)),
    }] : [];
  });

  if (content.length === 0) {
    content.push({ type: "paragraph", attrs: { blockId: createUuid() }, content: [] });
  }
  return { type: "doc", content };
}

export function documentToBlocks(document: JSONContent, previousBlocks: BlockNode[] = []): BlockNode[] {
  if (document.type !== "doc") throw new Error("El contenido de la nota no tiene un documento válido.");
  const usedPrevious = new Set<BlockNode>();
  const previousItems = previousBlocks.flatMap((block) => block.type === "checklist" ? flattenChecklistItems(block.items) : []);
  const usedPreviousItems = new Set<ChecklistItem>();

  return (document.content ?? []).flatMap((node, index): BlockNode[] => {
    if (node.type === "paragraph" && !nodeText(node).trim()) return [];
    if (node.type === "paragraph" || node.type === "heading" || node.type === "codeBlock" || node.type === "taskList") {
      const type = modelBlockType(node.type);
      const text = nodeText(node);
      const previous = findPreviousBlock(previousBlocks, usedPrevious, type, text, index);
      if (previous) usedPrevious.add(previous);
      const id = validUuid(node.attrs?.blockId) ?? previous?.id ?? createUuid();

      if (node.type === "paragraph") return [{ id, type: "paragraph", spans: contentToSpans(node.content) }];
      if (node.type === "heading") {
        const collapsed = typeof node.attrs?.collapsed === "boolean" ? node.attrs.collapsed : previous?.type === "heading" ? previous.collapsed : false;
        return [{
          id,
          type: "heading",
          level: isHeadingLevel(node.attrs?.level) ? node.attrs.level : 1,
          spans: contentToSpans(node.content),
          ...(collapsed ? { collapsed: true } : {}),
        }];
      }
      if (node.type === "codeBlock") {
        const language = typeof node.attrs?.language === "string" ? node.attrs.language : undefined;
        return [{
          id,
          type: "code",
          ...(language ? { language } : {}),
          text: (node.content ?? []).map((child) => child.text ?? "").join(""),
        }];
      }

      const previousChecklist = previous?.type === "checklist" ? previous : undefined;
      const items: ChecklistItem[] = [];
      for (const item of node.content ?? []) {
        if (item.type === "taskItem") editorNodeToChecklistItems(item, 0, previousItems, usedPreviousItems, items);
      }
      return [{ id, type: "checklist", autoSort: typeof node.attrs?.autoSort === "boolean" ? node.attrs.autoSort : previousChecklist?.autoSort ?? true, items }];
    }
    throw new Error(`El bloque Markdown «${node.type ?? "desconocido"}» no está soportado en las notas.`);
  });
}

export function parseNoteMarkdown(markdown: string, editor: Editor, previousBlocks: BlockNode[] = []): BlockNode[] {
  if (!editor.markdown) throw new Error("El parser Markdown de la nota no está disponible.");
  assertSupportedMarkdownTokens(editor.markdown.instance.lexer(markdown));
  const parsed = sanitizeLinks(editor.markdown.parse(markdown));
  assertSupportedMarkdown(parsed);
  return documentToBlocks(parsed, previousBlocks);
}

export function isSupportedMarkdownDocument(document: JSONContent): boolean {
  try {
    assertSupportedMarkdown(sanitizeLinks(document));
    return true;
  } catch {
    return false;
  }
}

function spansToEditorContent(spans: InlineSpan[]): JSONContent[] {
  const content: JSONContent[] = [];
  for (const span of spans) {
    const marks = formatToMarks(span.format);
    const lines = span.text.split("\n");
    lines.forEach((line, index) => {
      if (line) content.push({ type: "text", text: line, ...(marks.length ? { marks } : {}) });
      if (index < lines.length - 1) content.push({ type: "hardBreak", ...(marks.length ? { marks } : {}) });
    });
  }
  return content;
}

function contentToSpans(content: JSONContent[] = []): InlineSpan[] {
  const spans: InlineSpan[] = [];
  for (const node of content) {
    if (node.type === "text" && node.text) appendSpan(spans, node.text, marksToFormat(node.marks));
    if (node.type === "hardBreak") appendSpan(spans, "\n", marksToFormat(node.marks));
  }
  return spans;
}

function formatToMarks(format?: InlineFormat): NonNullable<JSONContent["marks"]> {
  if (!format) return [];
  const marks: NonNullable<JSONContent["marks"]> = [];
  if (format.bold) marks.push({ type: "bold" });
  if (format.italic) marks.push({ type: "italic" });
  if (format.code) marks.push({ type: "code" });
  if (format.link && isSafeWebUrl(format.link)) marks.push({ type: "link", attrs: { href: format.link } });
  if (format.highlight) marks.push({ type: "taskflowHighlight", attrs: { color: format.highlight } });
  return marks;
}

function marksToFormat(marks: JSONContent["marks"] = []): InlineFormat | undefined {
  const format: InlineFormat = {};
  for (const mark of marks) {
    if (mark.type === "bold") format.bold = true;
    if (mark.type === "italic") format.italic = true;
    if (mark.type === "code") format.code = true;
    if (mark.type === "link" && isSafeWebUrl(mark.attrs?.href)) format.link = mark.attrs.href;
    if (mark.type === "taskflowHighlight") format.highlight = normalizeHighlightColor(mark.attrs?.color);
  }
  return Object.keys(format).length > 0 ? format : undefined;
}

function appendSpan(spans: InlineSpan[], text: string, format?: InlineFormat) {
  const previous = spans.at(-1);
  if (previous && JSON.stringify(previous.format ?? {}) === JSON.stringify(format ?? {})) {
    previous.text += text;
    return;
  }
  spans.push({ text, ...(format ? { format } : {}) });
}

function checklistToTree(items: ChecklistItem[]): TaskTree[] {
  const flattened: Array<{ item: ChecklistItem; level: number }> = [];
  function append(item: ChecklistItem, baseLevel: number) {
    const level = Math.max(baseLevel, Math.min(4, Math.max(0, item.indentLevel)));
    flattened.push({ item, level });
    for (const child of item.children) append(child, level + 1);
  }
  items.forEach((item) => append(item, 0));

  const roots: TaskTree[] = [];
  const stack: TaskTree[] = [];
  for (const entry of flattened) {
    let level = entry.level;
    while (level > 0 && !stack[level - 1]) level -= 1;
    stack.length = level;
    const tree: TaskTree = { item: entry.item, level, children: [] };
    const parent = level > 0 ? stack[level - 1] : undefined;
    if (parent) parent.children.push(tree);
    else roots.push(tree);
    stack[level] = tree;
  }
  return roots;
}

type TaskTree = { item: ChecklistItem; level: number; children: TaskTree[] };

function taskTreeToEditorNode(tree: TaskTree, position: number): JSONContent {
  const content: JSONContent[] = [{
    type: "paragraph",
    content: spansToEditorContent(tree.item.spans),
  }];
  if (tree.children.length > 0) {
    content.push({ type: "taskList", content: tree.children.map((child, index) => taskTreeToEditorNode(child, index)) });
  }
  return {
    type: "taskItem",
    attrs: {
      checked: tree.item.status === "completed",
      itemId: tree.item.id,
      completedAt: tree.item.completedAt,
      indentLevel: tree.level,
      position,
    },
    content,
  };
}

function editorNodeToChecklistItems(
  node: JSONContent,
  depth: number,
  previousItems: ChecklistItem[],
  usedPrevious: Set<ChecklistItem>,
  result: ChecklistItem[],
) {
  const itemContent = node.content ?? [];
  const paragraphs = itemContent.filter((child) => child.type === "paragraph");
  const spans = paragraphs.flatMap((paragraph, index) => [
    ...(index > 0 ? [{ text: "\n" }] : []),
    ...contentToSpans(paragraph.content),
  ]);
  const text = spans.map((span) => span.text).join("");
  const position = result.length;
  const previous = findPreviousChecklistItem(previousItems, usedPrevious, node.attrs?.itemId, text, position);
  if (previous) usedPrevious.add(previous);
  const checked = node.attrs?.checked === true;
  const nestedList = itemContent.find((child) => child.type === "taskList");
  const completedAt = checked
    ? (typeof node.attrs?.completedAt === "string" ? node.attrs.completedAt : previous?.status === "completed" ? previous.completedAt : new Date().toISOString())
    : null;

  result.push({
    id: validUuid(node.attrs?.itemId) ?? previous?.id ?? createUuid(),
    spans,
    status: checked ? "completed" : "pending",
    completedAt,
    indentLevel: Math.min(4, depth),
    position,
    children: [],
  });
  for (const child of nestedList?.content ?? []) {
    if (child.type === "taskItem") editorNodeToChecklistItems(child, depth + 1, previousItems, usedPrevious, result);
  }
}

function findPreviousBlock(
  blocks: BlockNode[],
  used: Set<BlockNode>,
  type: BlockNode["type"],
  text: string,
  index: number,
): BlockNode | undefined {
  const candidates = blocks.filter((block) => block.type === type && !used.has(block));
  return candidates.find((block) => blockText(block) === text)
    ?? (blocks[index]?.type === type && !used.has(blocks[index]) ? blocks[index] : undefined)
    ?? candidates[0];
}

function findPreviousChecklistItem(
  items: ChecklistItem[],
  used: Set<ChecklistItem>,
  id: unknown,
  text: string,
  index: number,
): ChecklistItem | undefined {
  return items.find((item) => item.id === id && !used.has(item))
    ?? items.find((item) => !used.has(item) && item.spans.map((span) => span.text).join("") === text)
    ?? (items[index] && !used.has(items[index]) ? items[index] : undefined)
    ?? items.find((item) => !used.has(item));
}

function flattenChecklistItems(items: ChecklistItem[]): ChecklistItem[] {
  return items.flatMap((item) => [item, ...flattenChecklistItems(item.children)]);
}

function blockText(block: BlockNode): string {
  if (block.type === "code") return block.text;
  if (block.type === "divider") return "";
  if (block.type === "checklist") return flattenChecklistItems(block.items).map((item) => item.spans.map((span) => span.text).join("")).join(" ");
  return block.spans.map((span) => span.text).join("");
}

function nodeText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(nodeText).join("");
}

function modelBlockType(type: string): BlockNode["type"] {
  if (type === "codeBlock") return "code";
  if (type === "taskList") return "checklist";
  if (type === "paragraph" || type === "heading") return type;
  throw new Error(`El bloque «${type}» no está soportado en las notas.`);
}

function assertSupportedMarkdown(document: JSONContent) {
  function visit(node: JSONContent) {
    if (!node.type || !SUPPORTED_NODE_TYPES.has(node.type)) {
      throw new Error(`El bloque Markdown «${node.type ?? "desconocido"}» no está soportado en las notas.`);
    }
    for (const mark of node.marks ?? []) {
      if (!SUPPORTED_MARK_TYPES.has(mark.type)) {
        throw new Error(`El formato Markdown «${mark.type}» no está soportado en las notas.`);
      }
    }
    for (const child of node.content ?? []) visit(child);
  }
  visit(document);
}

function assertSupportedMarkdownTokens(tokens: MarkdownToken[]) {
  for (const token of tokens) {
    if (["blockquote", "hr", "table", "del"].includes(token.type ?? "")) {
      throw new Error(`El bloque Markdown «${token.type}» no está soportado en las notas.`);
    }
    if (token.type === "list") {
      const items = token.items ?? [];
      if (items.some((item) => item.task !== true)) {
        throw new Error("Las listas con viñetas no están soportadas; usa tareas con «- [ ]». ");
      }
      for (const item of items) assertSupportedMarkdownTokens(item.tokens ?? []);
      continue;
    }
    if (token.tokens) assertSupportedMarkdownTokens(token.tokens);
  }
}

function sanitizeLinks(node: JSONContent): JSONContent {
  const marks = node.marks?.filter((mark) => mark.type !== "link" || isSafeWebUrl(mark.attrs?.href));
  return {
    ...node,
    ...(marks ? { marks } : {}),
    ...(node.content ? { content: node.content.map(sanitizeLinks) } : {}),
  };
}

function isSafeWebUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeHighlightColor(value: unknown): HighlightColor {
  return typeof value === "string" && HIGHLIGHT_COLORS.includes(value as HighlightColor) ? value as HighlightColor : "orange";
}

function validUuid(value: unknown): string | undefined {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : undefined;
}

function createUuid(): string {
  return crypto.randomUUID();
}

function isHeadingLevel(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

const NoteMetadata = Extension.create({
  name: "noteMetadata",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "codeBlock", "taskList"],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attributes) => attributes.blockId ? { "data-block-id": attributes.blockId } : {},
          },
          collapsed: {
            default: false,
            parseHTML: (element) => element.getAttribute("data-collapsed") === "true",
            renderHTML: (attributes) => attributes.collapsed ? { "data-collapsed": "true" } : {},
          },
          autoSort: {
            default: true,
            parseHTML: (element) => element.getAttribute("data-auto-sort") !== "false",
            renderHTML: (attributes) => ({ "data-auto-sort": String(attributes.autoSort !== false) }),
          },
        },
      },
      {
        types: ["taskItem"],
        attributes: {
          itemId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-item-id"),
            renderHTML: (attributes) => attributes.itemId ? { "data-item-id": attributes.itemId } : {},
          },
          completedAt: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-completed-at"),
            renderHTML: (attributes) => attributes.completedAt ? { "data-completed-at": attributes.completedAt } : {},
          },
          indentLevel: {
            default: 0,
            parseHTML: (element) => Number(element.getAttribute("data-indent-level") ?? 0),
            renderHTML: (attributes) => ({ "data-indent-level": String(attributes.indentLevel ?? 0) }),
          },
          position: {
            default: 0,
            parseHTML: (element) => Number(element.getAttribute("data-position") ?? 0),
            renderHTML: (attributes) => ({ "data-position": String(attributes.position ?? 0) }),
          },
        },
      },
    ];
  },
});

const TaskFlowHighlight = Mark.create({
  name: "taskflowHighlight",
  addAttributes() {
    return {
      color: {
        default: "orange",
        parseHTML: (element) => normalizeHighlightColor(element.getAttribute("data-highlight")),
        renderHTML: (attributes) => ({ "data-highlight": normalizeHighlightColor(attributes.color) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "mark[data-highlight]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["mark", HTMLAttributes, 0];
  },
  markdownTokenizer: {
    name: "taskflowHighlight",
    level: "inline",
    start: (source) => source.indexOf("=={"),
    tokenize: (source, _tokens, lexer) => {
      const match = /^==\{(pink|purple|orange|mint|blue)\}([\s\S]+?)==/.exec(source);
      if (!match) return undefined;
      return {
        type: "taskflowHighlight",
        raw: match[0],
        color: match[1],
        tokens: lexer.inlineTokens(match[2]),
      } satisfies MarkdownToken;
    },
  },
  parseMarkdown: (token: MarkdownToken, helpers) => helpers.applyMark(
    "taskflowHighlight",
    helpers.parseInline(token.tokens ?? []),
    { color: normalizeHighlightColor(token.color) },
  ),
  renderMarkdown: (node: JSONContent, helpers) => (
    `=={${normalizeHighlightColor(node.attrs?.color)}}${helpers.renderChildren(node)}==`
  ),
});