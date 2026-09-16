import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TaskList } from "@/domain/list/models";
import type { Task } from "@/domain/task/models";
import { TaskWorkspaceProvider, useTaskWorkspace, type WorkspaceRepositories } from "./TaskWorkspaceProvider";

const list: TaskList = {
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
  listId: list.id,
  title: "Tarea de prueba",
  description: "",
  status: "pending",
  source: "manual",
  position: 0,
  completedAt: null,
  createdAt: "2026-09-16T10:00:00Z",
  updatedAt: "2026-09-16T10:00:00Z",
};

function Probe({ statusTestId = "task-status" }: { statusTestId?: string }) {
  const { lists, tasks, completeTask } = useTaskWorkspace();
  return (
    <div>
      <span data-testid="list-count">{lists.length}</span>
      <span data-testid={statusTestId}>{tasks[0]?.status}</span>
      <button type="button" onClick={() => void completeTask(task.id)}>Completar</button>
    </div>
  );
}

function repositories(overrides: Partial<WorkspaceRepositories> = {}): WorkspaceRepositories {
  return {
    lists: {
      findAll: vi.fn().mockResolvedValue([list]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tasks: {
      findAll: vi.fn().mockResolvedValue([task]),
      create: vi.fn(),
      update: vi.fn(),
      complete: vi.fn().mockResolvedValue({ ...task, status: "completed", completedAt: "2026-09-16T11:00:00Z" }),
      reopen: vi.fn(),
      delete: vi.fn(),
    },
    history: { findPage: vi.fn() },
    ...overrides,
  };
}

describe("TaskWorkspaceProvider", () => {
  it("loads injected repositories and applies a completed task", async () => {
    render(
      <TaskWorkspaceProvider repositories={repositories()}>
        <Probe />
      </TaskWorkspaceProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("list-count")).toHaveTextContent("1"));
    expect(screen.getByTestId("task-status")).toHaveTextContent("pending");
    fireEvent.click(screen.getByRole("button", { name: "Completar" }));
    await waitFor(() => expect(screen.getByTestId("task-status")).toHaveTextContent("completed"));
  });

  it("rolls back an optimistic completion when the repository fails", async () => {
    const failingRepositories = repositories();
    failingRepositories.tasks.complete = vi.fn().mockRejectedValue(new Error("API caída"));
    const rendered = render(
      <TaskWorkspaceProvider repositories={failingRepositories}>
        <Probe statusTestId="rollback-status" />
      </TaskWorkspaceProvider>,
    );

    await waitFor(() => expect(screen.getAllByTestId("rollback-status").some((element) => element.textContent === "pending")).toBe(true));
    fireEvent.click(rendered.getAllByRole("button", { name: "Completar" })[0]);
    await waitFor(() => expect(screen.getAllByTestId("rollback-status").some((element) => element.textContent === "pending")).toBe(true));
  });
});