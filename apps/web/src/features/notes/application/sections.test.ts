import { describe, expect, it } from "vitest";

import type { BlockNode } from "@/domain/note/models";
import { expandAllSections, getSectionRange, setSectionsCollapsed, toggleSection } from "./sections";

const blocks: BlockNode[] = [
  { id: "h1", type: "heading", level: 1, spans: [{ text: "Chapter" }] },
  { id: "p1", type: "paragraph", spans: [{ text: "Intro" }] },
  { id: "h2", type: "heading", level: 2, spans: [{ text: "Detail" }] },
  { id: "p2", type: "paragraph", spans: [{ text: "Body" }] },
  { id: "h1-2", type: "heading", level: 1, spans: [{ text: "Next" }] },
];

describe("note sections", () => {
  it("finds content until the next heading at the same or higher level", () => {
    expect(getSectionRange(blocks, 0)).toEqual([1, 3]);
    expect(getSectionRange(blocks, 2)).toEqual([3, 3]);
  });

  it("toggles one heading and can collapse or expand a level", () => {
    const collapsed = toggleSection(blocks, 0);
    expect(collapsed[0]).toMatchObject({ id: "h1", collapsed: true });
    expect(setSectionsCollapsed(collapsed, 2, true)[2]).toMatchObject({ collapsed: true });
    expect(expandAllSections(collapsed)[0]).toMatchObject({ collapsed: false });
  });
});
