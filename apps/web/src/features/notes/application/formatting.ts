import type { HighlightColor, InlineFormat, InlineSpan } from "@/domain/note/models";

export function applyHighlight(
  spans: InlineSpan[],
  selectionStart: number,
  selectionEnd: number,
  color: HighlightColor,
): InlineSpan[] {
  if (selectionStart >= selectionEnd) return spans;
  const result: InlineSpan[] = [];
  let offset = 0;
  for (const span of spans) {
    const spanStart = offset;
    const spanEnd = offset + span.text.length;
    const overlapStart = Math.max(selectionStart, spanStart);
    const overlapEnd = Math.min(selectionEnd, spanEnd);
    if (overlapStart >= overlapEnd) {
      result.push(span);
    } else {
      const localStart = overlapStart - spanStart;
      const localEnd = overlapEnd - spanStart;
      const before = span.text.slice(0, localStart);
      const selected = span.text.slice(localStart, localEnd);
      const after = span.text.slice(localEnd);
      if (before) result.push({ ...span, text: before });
      const format: InlineFormat = { ...span.format };
      if (format.highlight === color) delete format.highlight;
      else format.highlight = color;
      result.push({ ...span, text: selected, format: Object.keys(format).length > 0 ? format : undefined });
      if (after) result.push({ ...span, text: after });
    }
    offset = spanEnd;
  }
  return result;
}