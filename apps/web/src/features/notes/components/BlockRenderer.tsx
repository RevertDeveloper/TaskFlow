import type { ReactNode } from "react";

import type { BlockNode, InlineSpan } from "@/domain/note/models";
import { getCollapsedBlockIds } from "../application/sections";
import { ChecklistBlock } from "./ChecklistBlock";

type BlockHandlers = {
  onChecklistChange?: (blockId: string, items: import("@/domain/note/models").ChecklistItem[]) => void;
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
  return <div className="note-blocks">{blocks.map((block, index) => collapsedBlockIds.has(block.id)
    ? null
    : renderBlock(block, handlers, index, blocks))}</div>;
}

function renderBlock(block: BlockNode, handlers: BlockHandlers, _index: number, _blocks: BlockNode[]): ReactNode {
  switch (block.type) {
    case "heading": {
      const Heading = `h${block.level}` as "h1" | "h2" | "h3";
      return <div className="note-heading-block" key={block.id}>
        <button className="note-heading-block__toggle" type="button" aria-label={block.collapsed ? "Expandir sección" : "Colapsar sección"} aria-expanded={!block.collapsed} onClick={() => handlers.onHeadingToggle?.(block.id)}><span aria-hidden="true">{block.collapsed ? "▶" : "▼"}</span></button>
        <Heading>{<input className="note-block-input" value={block.spans.map((span) => span.text).join("")} aria-label={`Encabezado nivel ${block.level}`} onSelect={(event) => handlers.onTextSelection?.(block.id, event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0)} onChange={(event) => handlers.onTextChange?.(block.id, event.target.value)} />}</Heading>
      </div>;
    }
    case "paragraph":
      return <textarea className="note-block-input note-block-input--paragraph" key={block.id} value={block.spans.map((span) => span.text).join("")} aria-label="Párrafo de la nota" onSelect={(event) => handlers.onTextSelection?.(block.id, event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0)} onChange={(event) => handlers.onTextChange?.(block.id, event.target.value)} />;
    case "checklist":
      return <ChecklistBlock key={block.id} block={block} onChange={(items) => handlers.onChecklistChange?.(block.id, items)} />;
    case "code":
      return <pre key={block.id}><code>{block.text}</code></pre>;
    case "divider":
      return <hr key={block.id} className="note-divider" aria-hidden="true" />;
  }
}
