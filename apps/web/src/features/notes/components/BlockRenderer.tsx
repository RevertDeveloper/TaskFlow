import type { ReactNode } from "react";

import type { BlockNode, InlineSpan } from "@/domain/note/models";
import { getCollapsedBlockIds } from "../application/sections";
import { ChecklistBlock } from "./ChecklistBlock";

type BlockHandlers = {
  onChecklistChange?: (blockId: string, items: import("@/domain/note/models").ChecklistItem[]) => void;
  focusChecklistItemId?: string;
  onCodeChange?: (blockId: string, text: string) => void;
  onTextChange?: (blockId: string, text: string) => void;
  onTextSelection?: (blockId: string, start: number, end: number) => void;
  onHeadingToggle?: (blockId: string) => void;
};

export function renderSpan(span: InlineSpan, key: string | number): ReactNode {
  const format = span.format;
  const content = span.text.split("\n").map((line, index) => (
    <span key={`${key}-${index}`}>{line}{index < span.text.split("\n").length - 1 ? <br /> : null}</span>
  ));
  if (format?.link && /^https?:\/\//.test(format.link)) {
    return <a href={format.link} key={key} rel="noopener noreferrer">{content}</a>;
  }
  if (format?.code) return <code key={key}>{content}</code>;
  if (format?.bold) return <strong key={key}>{content}</strong>;
  if (format?.italic) return <em key={key}>{content}</em>;
  if (format?.highlight) return <mark key={key} data-highlight={format.highlight}>{content}</mark>;
  return <span key={key}>{content}</span>;
}

export function BlockRenderer({ blocks, handlers = {} }: { blocks: BlockNode[]; handlers?: BlockHandlers }) {
  const collapsedBlockIds = getCollapsedBlockIds(blocks);
  return <div className="note-blocks">{blocks.map((block) => collapsedBlockIds.has(block.id)
    ? null
    : renderBlock(block, handlers))}</div>;
}

function renderBlock(block: BlockNode, handlers: BlockHandlers): ReactNode {
  switch (block.type) {
    case "heading": {
      const Heading = `h${block.level}` as "h1" | "h2" | "h3";
      return <div className="note-heading-block" key={block.id}>
        <Heading><input className="note-block-input" value={block.spans.map((span) => span.text).join("")} aria-label={`Encabezado nivel ${block.level}`} onSelect={(event) => handlers.onTextSelection?.(block.id, event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0)} onChange={(event) => handlers.onTextChange?.(block.id, event.target.value)} /></Heading>
        <button className="note-heading-block__toggle" type="button" aria-label={block.collapsed ? "Expandir sección" : "Colapsar sección"} aria-expanded={!block.collapsed} onClick={() => handlers.onHeadingToggle?.(block.id)}><span aria-hidden="true">{block.collapsed ? "▶" : "▼"}</span></button>
      </div>;
    }
    case "paragraph":
      return <textarea ref={fitTextarea} onInput={(event) => fitTextarea(event.currentTarget)} className="note-block-input note-block-input--paragraph" key={block.id} value={block.spans.map((span) => span.text).join("")} aria-label="Párrafo de la nota" onSelect={(event) => handlers.onTextSelection?.(block.id, event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0)} onChange={(event) => handlers.onTextChange?.(block.id, event.target.value)} />;
    case "checklist":
      return <ChecklistBlock key={block.id} block={block} focusItemId={handlers.focusChecklistItemId} onChange={(items) => handlers.onChecklistChange?.(block.id, items)} />;
    case "code":
      return <textarea ref={fitTextarea} onInput={(event) => fitTextarea(event.currentTarget)} className="note-code-input" key={block.id} value={block.text} aria-label="Bloque de código" spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="Escribe o pega código…" onChange={(event) => handlers.onCodeChange?.(block.id, event.target.value)} />;
    case "divider":
      return <hr key={block.id} className="note-divider" aria-hidden="true" />;
  }
}

function fitTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}
