import type { HistoryEntry } from "@/domain/history/models";
import type { ListDraft, TaskList } from "@/domain/list/models";
import type { Task, TaskDraft } from "@/domain/task/models";
import type { ApiEnvelope, HistoryOutput, ListCreate, ListOutput, TaskCreate, TaskOutput } from "@/infrastructure/api/generated/types";
import { api } from "@/infrastructure/api/httpClient";

export type TaskFlowApiClient = typeof api;

export async function collectPages<T>(load: (page: number) => Promise<ApiEnvelope<T[]>>): Promise<T[]> {
  const firstPage = await load(1);
  if (firstPage.meta.total_pages <= 1) {
    return firstPage.data;
  }
  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.meta.total_pages - 1 }, (_, index) => load(index + 2)),
  );
  return [firstPage.data, ...remainingPages.map((page) => page.data)].flat();
}

export function pageQuery(page: number): string {
  return `?page=${page}&page_size=100`;
}

export function mapList(value: ListOutput): TaskList {
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

export function mapTask(value: TaskOutput): Task {
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

export function mapHistory(value: HistoryOutput): HistoryEntry {
  return {
    id: value.id,
    taskId: value.task_id,
    eventType: value.event_type,
    payload: value.payload,
    createdAt: value.created_at,
  };
}

export function toListCreate(input: ListDraft): ListCreate {
  return input;
}

export function toTaskCreate(input: TaskDraft): TaskCreate {
  return {
    list_id: input.listId,
    title: input.title,
    description: input.description,
    source: "manual",
  };
}