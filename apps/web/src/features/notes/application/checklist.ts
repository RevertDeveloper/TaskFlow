import type { ChecklistItem, InlineSpan } from "@/domain/note/models";

export function createChecklistItem(position: number): ChecklistItem {
  return {
    id: crypto.randomUUID(),
    spans: [{ text: "" }],
    status: "pending",
    completedAt: null,
    indentLevel: 0,
    position,
    children: [],
  };
}

export function sortChecklistItems(items: ChecklistItem[]): ChecklistItem[] {
  const pending = items.filter((item) => item.status === "pending");
  const completed = items.filter((item) => item.status === "completed");
  return [...pending, ...completed].map((item, index) => ({ ...item, position: index }));
}

export function indentItem(item: ChecklistItem, delta: 1 | -1): ChecklistItem {
  return {
    ...item,
    indentLevel: Math.max(0, Math.min(4, item.indentLevel + delta)),
  };
}

export function insertSoftReturn(item: ChecklistItem, spanIndex: number, offset: number): ChecklistItem {
  const spans = item.spans.map((span, index) => {
    if (index !== spanIndex) return span;
    return {
      ...span,
      text: `${span.text.slice(0, offset)}\n${span.text.slice(offset)}`,
    };
  });
  return { ...item, spans };
}

export function toggleChecklistItem(item: ChecklistItem, completedAt = new Date().toISOString()): ChecklistItem {
  const completed = item.status !== "completed";
  return {
    ...item,
    status: completed ? "completed" : "pending",
    completedAt: completed ? completedAt : null,
  };
}

export function extractPlainTextFromSpans(spans: InlineSpan[]): string {
  return spans.map((span) => span.text).join("");
}
