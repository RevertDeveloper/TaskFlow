import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TaskList } from "@/domain/list/models";
import type { Task } from "@/domain/task/models";
import { QuickTaskInput } from "./QuickTaskInput";
import { TaskBoard } from "./TaskBoard";

const inbox: TaskList = {
  id: "inbox-id",
  name: "Inbox",
  description: "",
  emoji: "",
  color: "",
  position: 0,
  isArchived: false,
  isSystem: true,
};

const task: Task = {
  id: "task-id",
  listId: inbox.id,
  title: "Preparar la demo",
  description: "",
  status: "pending",
  source: "manual",
  position: 0,
  completedAt: null,
  createdAt: "2026-09-16T10:00:00Z",
  updatedAt: "2026-09-16T10:00:00Z",
};

describe("task management components", () => {
  it("creates a task from the quick capture form and clears the input", async () => {
    const onCreate = vi.fn().mockResolvedValue(task);
    render(<QuickTaskInput defaultListId={inbox.id} onCreate={onCreate} />);

    const input = screen.getByRole("textbox", { name: "Nueva tarea" });
    fireEvent.change(input, { target: { value: "  Preparar la demo  " } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ listId: inbox.id, title: "Preparar la demo" }));
    expect(input).toHaveValue("");
  });

  it("groups pending tasks by list and exposes the complete action", () => {
    const onComplete = vi.fn();
    render(
      <TaskBoard
        lists={[inbox]}
        tasks={[task]}
        activeListId={null}
        onComplete={onComplete}
        onReopen={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Inbox", level: 2 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Completar Preparar la demo" }));
    expect(onComplete).toHaveBeenCalledWith(task.id);
  });

  it("shows an actionable empty state when a list has no pending tasks", () => {
    render(
      <TaskBoard
        lists={[inbox]}
        tasks={[]}
        activeListId={inbox.id}
        onComplete={vi.fn()}
        onReopen={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Esta lista está despejada." })).toBeInTheDocument();
  });
});