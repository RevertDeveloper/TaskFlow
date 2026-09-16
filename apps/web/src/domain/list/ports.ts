import type { ListDraft, ListPatch, TaskList } from "./models";

export interface ListRepository {
  findAll(): Promise<TaskList[]>;
  create(input: ListDraft): Promise<TaskList>;
  update(id: string, input: ListPatch): Promise<TaskList>;
  delete(id: string): Promise<void>;
}