import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Input } from "./Input";
import { Tabs } from "./Tabs";
import { ListSwitcher } from "../navigation/ListSwitcher";

describe("base UI controls", () => {
  it("keeps button loading state explicit and non-interactive", () => {
    render(<Button loading>Guardar</Button>);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });

  it("associates form controls with their labels and errors", () => {
    render(<Input id="title" label="Título" error="El título es obligatorio." />);
    expect(screen.getByLabelText("Título")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("El título es obligatorio.");
  });

  it("supports keyboard tab navigation", () => {
    const onChange = vi.fn();
    render(<Tabs activeId="today" onChange={onChange} tabs={[{ id: "today", label: "Hoy", panel: "Hoy" }, { id: "week", label: "Semana", panel: "Semana" }]} />);
    const today = screen.getByRole("tab", { name: "Hoy" });
    today.focus();
    fireEvent.keyDown(today, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("week");
  });

  it("renders a checkbox as one labelled hit target", () => {
    render(<Checkbox id="done" label="Marcar como completada" />);
    expect(screen.getByLabelText("Marcar como completada")).toBeInTheDocument();
  });

  it("moves through the horizontal list switcher with arrow keys", () => {
    const onChange = vi.fn();
    render(
      <ListSwitcher
        lists={[{ id: "inbox", name: "Inbox" }, { id: "work", name: "Trabajo" }]}
        activeListId="inbox"
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole("tab", { name: "Inbox" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("work");
  });
});