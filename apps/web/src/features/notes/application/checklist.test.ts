import { describe, expect, it } from "vitest";

import type { ChecklistItem } from "@/domain/note/models";
import { createChecklistItem, indentItem, insertSoftReturn, sortChecklistItems, toggleChecklistItem } from "./checklist";

function item(id: string, status: ChecklistItem["status"], position: number): ChecklistItem {
  return {
    id,
    spans: [{ text: id }],
    status,
    completedAt: status === "completed" ? "2026-09-22T10:00:00.000Z" : null,
    indentLevel: 0,
    position,
    children: [],
  };
}

describe("checklist helpers", () => {
  it("creates a pending empty item at the requested position", () => {
    expect(createChecklistItem(2)).toMatchObject({
      spans: [{ text: "" }],
      status: "pending",
      completedAt: null,
      indentLevel: 0,
      position: 2,
      children: [],
    });
  });

  it("moves completed items after pending items and normalizes positions", () => {
    expect(sortChecklistItems([item("done", "completed", 4), item("todo", "pending", 7)]).map((entry) => [entry.id, entry.position]))
      .toEqual([["todo", 0], ["done", 1]]);
  });

  it("clamps indentation to the supported range", () => {
    expect(indentItem({ ...item("task", "pending", 0), indentLevel: 4 }, 1).indentLevel).toBe(4);
    expect(indentItem(item("task", "pending", 0), -1).indentLevel).toBe(0);
  });

  it("inserts a soft return inside one span", () => {
    expect(insertSoftReturn(item("task", "pending", 0), 0, 2).spans[0].text).toBe("ta\nsk");
  });

  it("toggles completion and completion timestamp", () => {
    const completed = toggleChecklistItem(item("task", "pending", 0), "2026-09-22T10:30:00.000Z");
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBe("2026-09-22T10:30:00.000Z");
    expect(toggleChecklistItem(completed).completedAt).toBeNull();
  });
});
