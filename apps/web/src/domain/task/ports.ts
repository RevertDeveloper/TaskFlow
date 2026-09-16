import type { Task, TaskDraft, TaskPatch } from "./models";

export interface TaskRepository {
  findAll(): Promise<Task[]>;
  create(input: TaskDraft): Promise<Task>;
  update(id: string, input: TaskPatch): Promise<Task>;
  complete(id: string): Promise<Task>;
  reopen(id: string): Promise<Task>;
  delete(id: string): Promise<void>;
}