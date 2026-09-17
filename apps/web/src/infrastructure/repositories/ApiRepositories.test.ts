import { describe, expect, it, vi } from "vitest";

import type { ApiEnvelope, HistoryOutput, ListOutput, TaskOutput } from "@/infrastructure/api/generated/types";
import { ApiHistoryRepository } from "./ApiHistoryRepository";
import { ApiListRepository } from "./ApiListRepository";
import { ApiTaskRepository } from "./ApiTaskRepository";
import type { TaskFlowApiClient } from "./ApiRepositorySupport";

describe("API repositories", () => {
  it("collects paginated lists and maps DTO fields", async () => {
    const firstPage: ApiEnvelope<ListOutput[]> = {
      data: [listOutput("list-a", "Inbox", true)],
      meta: { page: 1, page_size: 100, total_count: 2, total_pages: 2 },
    };
    const secondPage: ApiEnvelope<ListOutput[]> = {
      data: [listOutput("list-b", "Trabajo", false)],
      meta: { page: 2, page_size: 100, total_count: 2, total_pages: 2 },
    };
    const client = fakeClient({
      lists: vi.fn((query = "") => Promise.resolve(query.includes("page=2") ? secondPage : firstPage)),
      updateList: vi.fn().mockResolvedValue({ data: { ...listOutput("list-a", "Inbox", true), is_archived: true }, meta: emptyMeta() }),
    });

    await expect(new ApiListRepository(client).findAll()).resolves.toEqual([
      expect.objectContaining({ id: "list-a", name: "Inbox", isSystem: true }),
      expect.objectContaining({ id: "list-b", name: "Trabajo", isSystem: false }),
    ]);
    expect(client.lists).toHaveBeenCalledWith("?page=1&page_size=100");
    expect(client.lists).toHaveBeenCalledWith("?page=2&page_size=100");
    await expect(new ApiListRepository(client).update("list-a", { isArchived: true })).resolves.toMatchObject({ isArchived: true });
    expect(client.updateList).toHaveBeenCalledWith("list-a", { is_archived: true });
  });

  it("maps task mutations and history pagination through the typed client", async () => {
    const task = taskOutput();
    const history: ApiEnvelope<HistoryOutput[]> = {
      data: [{ id: "event-1", task_id: task.id, event_type: "TASK_CREATED", payload: { title: task.title }, created_at: task.created_at }],
      meta: { page: 1, page_size: 20, total_count: 1, total_pages: 1 },
    };
    const client = fakeClient({
      createTask: vi.fn().mockResolvedValue({ data: task, meta: emptyMeta() }),
      completeTask: vi.fn().mockResolvedValue({ data: { ...task, status: "completed", completed_at: "2026-09-17T11:00:00Z" }, meta: emptyMeta() }),
      history: vi.fn().mockResolvedValue(history),
    });
    const tasks = new ApiTaskRepository(client);
    const histories = new ApiHistoryRepository(client);

    await expect(tasks.create({ listId: task.list_id, title: task.title })).resolves.toMatchObject({
      id: task.id,
      listId: task.list_id,
    });
    await expect(tasks.complete(task.id)).resolves.toMatchObject({ status: "completed" });
    await expect(histories.findPage({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      totalCount: 1,
      entries: [{ id: "event-1", taskId: task.id }],
    });
    expect(client.createTask).toHaveBeenCalledWith({ list_id: task.list_id, title: task.title, description: undefined, source: "manual" });
    expect(client.history).toHaveBeenCalledWith("?page=1&page_size=20");
  });
});

function fakeClient(overrides: Partial<TaskFlowApiClient> = {}): TaskFlowApiClient {
  return {
    lists: vi.fn().mockResolvedValue({ data: [], meta: emptyMeta() }),
    tasks: vi.fn().mockResolvedValue({ data: [], meta: emptyMeta() }),
    history: vi.fn().mockResolvedValue({ data: [], meta: emptyMeta() }),
    listHistory: vi.fn().mockResolvedValue({ data: [], meta: emptyMeta() }),
    createList: vi.fn().mockResolvedValue({ data: listOutput("list-a", "Lista", false), meta: emptyMeta() }),
    updateList: vi.fn().mockResolvedValue({ data: listOutput("list-a", "Lista", false), meta: emptyMeta() }),
    deleteList: vi.fn().mockResolvedValue(undefined),
    createTask: vi.fn().mockResolvedValue({ data: taskOutput(), meta: emptyMeta() }),
    updateTask: vi.fn().mockResolvedValue({ data: taskOutput(), meta: emptyMeta() }),
    completeTask: vi.fn().mockResolvedValue({ data: taskOutput(), meta: emptyMeta() }),
    reopenTask: vi.fn().mockResolvedValue({ data: taskOutput(), meta: emptyMeta() }),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function emptyMeta() {
  return { page: 1, page_size: 100, total_count: 0, total_pages: 1 };
}

function listOutput(id: string, name: string, isSystem: boolean): ListOutput {
  return {
    id,
    name,
    description: "",
    emoji: "",
    color: "",
    position: 0,
    is_archived: false,
    is_system: isSystem,
    created_at: "2026-09-17T10:00:00Z",
    updated_at: "2026-09-17T10:00:00Z",
  };
}

function taskOutput(): TaskOutput {
  return {
    id: "task-a",
    list_id: "list-a",
    title: "Preparar entrega",
    description: "",
    status: "pending",
    source: "manual",
    position: 0,
    completed_at: null,
    created_at: "2026-09-17T10:00:00Z",
    updated_at: "2026-09-17T10:00:00Z",
  };
}