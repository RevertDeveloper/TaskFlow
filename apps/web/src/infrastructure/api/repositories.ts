import type { ApiEnvelope, HistoryOutput, ListCreate, ListOutput, TaskCreate, TaskOutput } from "./generated/types";
import { api } from "./httpClient";
import type { HistoryPage } from "@/domain/history/models";
import type { HistoryRepository } from "@/domain/history/ports";
import type { ListDraft, ListPatch, TaskList } from "@/domain/list/models";
import type { ListRepository } from "@/domain/list/ports";
import type { Task, TaskDraft, TaskPatch } from "@/domain/task/models";
import type { TaskRepository } from "@/domain/task/ports";

export class ApiListRepository implements ListRepository {
  async findAll(): Promise<TaskList[]> {
    return collectPages((page) => api.lists(pageQuery(page))).then((items) => items.map(mapList));
  }

  async create(input: ListDraft): Promise<TaskList> {
    const response = await api.createList(toListCreate(input));
    return mapList(response.data);
  }

  async update(id: string, input: ListPatch): Promise<TaskList> {
    const response = await api.updateList(id, {
      ...input,
      is_archived: input.isArchived,
    });
    return mapList(response.data);
  }

  async delete(id: string): Promise<void> {
    await api.deleteList(id);
  }
}

export class ApiTaskRepository implements TaskRepository {
  async findAll(): Promise<Task[]> {
    return collectPages((page) => api.tasks(pageQuery(page))).then((items) => items.map(mapTask));
  }

  async create(input: TaskDraft): Promise<Task> {
    const response = await api.createTask(toTaskCreate(input));
    return mapTask(response.data);
  }

  async update(id: string, input: TaskPatch): Promise<Task> {
    const response = await api.updateTask(id, { list_id: input.listId, title: input.title, description: input.description });
    return mapTask(response.data);
  }

  async complete(id: string): Promise<Task> {
    const response = await api.completeTask(id);
    return mapTask(response.data);
  }

  async reopen(id: string): Promise<Task> {
    const response = await api.reopenTask(id);
    return mapTask(response.data);
  }

  async delete(id: string): Promise<void> {
    await api.deleteTask(id);
  }
}

export class ApiHistoryRepository implements HistoryRepository {
  async findPage(input: { listId?: string; page?: number; pageSize?: number } = {}): Promise<HistoryPage> {
    const params = new URLSearchParams({
      page: String(input.page ?? 1),
      page_size: String(input.pageSize ?? 20),
    });
    if (input.listId) {
      params.set("list_id", input.listId);
    }
    const response = input.listId
      ? await api.listHistory(input.listId, `?${params.toString()}`)
      : await api.history(`?${params.toString()}`);
    return {
      entries: response.data.map(mapHistory),
      page: response.meta.page,
      totalPages: response.meta.total_pages,
      totalCount: response.meta.total_count,
    };
  }
}

export const taskFlowRepositories = {
  lists: new ApiListRepository(),
  tasks: new ApiTaskRepository(),
  history: new ApiHistoryRepository(),
};

async function collectPages<T>(load: (page: number) => Promise<ApiEnvelope<T[]>>): Promise<T[]> {
  const firstPage = await load(1);
  if (firstPage.meta.total_pages <= 1) {
    return firstPage.data;
  }
  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.meta.total_pages - 1 }, (_, index) => load(index + 2)),
  );
  return [firstPage.data, ...remainingPages.map((page) => page.data)].flat();
}

function pageQuery(page: number): string {
  return `?page=${page}&page_size=100`;
}

function mapList(value: ListOutput): TaskList {
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    emoji: value.emoji,
    color: value.color,
    position: value.position,
    isArchived: value.is_archived,
    isSystem: value.is_system,
  };
}

function mapTask(value: TaskOutput): Task {
  return {
    id: value.id,
    listId: value.list_id,
    title: value.title,
    description: value.description,
    status: value.status,
    source: value.source,
    position: value.position,
    completedAt: value.completed_at,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function mapHistory(value: HistoryOutput) {
  return {
    id: value.id,
    taskId: value.task_id,
    eventType: value.event_type,
    payload: value.payload,
    createdAt: value.created_at,
  };
}

function toListCreate(input: ListDraft): ListCreate {
  return input;
}

function toTaskCreate(input: TaskDraft): TaskCreate {
  return {
    list_id: input.listId,
    title: input.title,
    description: input.description,
    source: "manual",
  };
}