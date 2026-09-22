import type { ReactNode } from "react";

import type { BlockNode, InlineSpan } from "@/domain/note/models";
import { ChecklistBlock } from "./ChecklistBlock";

type BlockHandlers = {
  onChecklistChange?: (blockId: string, items: import("@/domain/note/models").ChecklistItem[]) => void;
  onTextChange?: (blockId: string, text: string) => void;
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
  return <div className="note-blocks">{blocks.map((block) => renderBlock(block, handlers))}</div>;
}

function renderBlock(block: BlockNode, handlers: BlockHandlers): ReactNode {
  switch (block.type) {
    case "heading": {
      const Heading = `h${block.level}` as "h1" | "h2" | "h3";
      return <Heading key={block.id}>{block.level === 1 ? null : <input className="note-block-input" value={block.spans.map((span) => span.text).join("")} aria-label={`Encabezado nivel ${block.level}`} onChange={(event) => handlers.onTextChange?.(block.id, event.target.value)} />}</Heading>;
    }
    case "paragraph":
      return <textarea className="note-block-input note-block-input--paragraph" key={block.id} value={block.spans.map((span) => span.text).join("")} aria-label="Párrafo de la nota" onChange={(event) => handlers.onTextChange?.(block.id, event.target.value)} />;
    case "checklist":
      return <ChecklistBlock key={block.id} block={block} onChange={(items) => handlers.onChecklistChange?.(block.id, items)} />;
    case "code":
      return <pre key={block.id}><code>{block.text}</code></pre>;
    case "divider":
      return <hr key={block.id} className="note-divider" aria-hidden="true" />;
  }
}
