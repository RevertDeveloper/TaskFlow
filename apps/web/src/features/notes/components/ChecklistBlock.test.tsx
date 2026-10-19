import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChecklistItem } from "@/domain/note/models";
import { ChecklistBlock } from "./ChecklistBlock";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ChecklistBlock", () => {
  it("starts task text at a single row", () => {
    render(<ChecklistHarness initialItems={[item("one", "Primero", 0)]} />);

    expect(screen.getByRole("textbox", { name: "Texto del ítem 1" })).toHaveAttribute("rows", "1");
  });

  it("adds and focuses a new item with the add action", () => {
    render(<ChecklistHarness initialItems={[item("one", "Primero", 0)]} />);

    fireEvent.click(screen.getByRole("button", { name: "Añadir ítem" }));

    const secondItem = screen.getByRole("textbox", { name: "Texto del ítem 2" });
    expect(secondItem).toHaveValue("");
    expect(document.activeElement).toBe(secondItem);
  });

  it("creates and focuses the next item when Enter is pressed", () => {
    render(<ChecklistHarness initialItems={[item("one", "Primero", 0)]} />);

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Texto del ítem 1" }), { key: "Enter" });

    const secondItem = screen.getByRole("textbox", { name: "Texto del ítem 2" });
    expect(secondItem).toHaveValue("");
    expect(document.activeElement).toBe(secondItem);
  });

  it("reorders items with labelled controls", () => {
    render(<ChecklistHarness initialItems={[item("one", "Primero", 0), item("two", "Segundo", 1)]} />);

    fireEvent.click(screen.getByRole("button", { name: "Mover ítem 2 arriba" }));

    expect(screen.getByRole("textbox", { name: "Texto del ítem 1" })).toHaveValue("Segundo");
    expect(screen.getByRole("textbox", { name: "Texto del ítem 2" })).toHaveValue("Primero");
    expect(screen.getByRole("button", { name: "Mover ítem 1 arriba" })).toBeDisabled();
  });

  it("auto-sorts completed items even when animation events are unavailable", async () => {
    vi.useFakeTimers();
    render(<ChecklistHarness initialItems={[
      item("done", "Hecho", 0, "completed"),
      item("pending", "Pendiente", 1),
      item("completing", "Completando", 2),
    ]} />);

    fireEvent.click(screen.getByRole("button", { name: "Marcar como completado el ítem 3" }));
    await act(async () => { vi.advanceTimersByTime(250); });

    expect(screen.getAllByRole("textbox").map((input) => (input as HTMLTextAreaElement).value))
      .toEqual(["Pendiente", "Hecho", "Completando"]);
  });
});

function ChecklistHarness({ initialItems }: { initialItems: ChecklistItem[] }) {
  const [items, setItems] = useState(initialItems);
  return <ChecklistBlock block={{ id: "checklist", type: "checklist", autoSort: true, items }} onChange={setItems} />;
}

function item(id: string, text: string, position: number, status: ChecklistItem["status"] = "pending"): ChecklistItem {
  return {
    id,
    spans: [{ text }],
    status,
    completedAt: status === "completed" ? "2026-09-25T10:00:00.000Z" : null,
    indentLevel: 0,
    position,
    children: [],
  };
}