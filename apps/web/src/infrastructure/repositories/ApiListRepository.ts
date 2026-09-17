import type { ListDraft, ListPatch, TaskList } from "@/domain/list/models";
import type { ListRepository } from "@/domain/repositories/ListRepository";
import { api } from "@/infrastructure/api/httpClient";
import type { TaskFlowApiClient } from "./ApiRepositorySupport";
import { collectPages, mapList, pageQuery, toListCreate } from "./ApiRepositorySupport";

export class ApiListRepository implements ListRepository {
  constructor(private readonly client: TaskFlowApiClient = api) {}

  async findAll(): Promise<TaskList[]> {
    return collectPages((page) => this.client.lists(pageQuery(page))).then((items) => items.map(mapList));
  }

  async create(input: ListDraft): Promise<TaskList> {
    const response = await this.client.createList(toListCreate(input));
    return mapList(response.data);
  }

  async update(id: string, input: ListPatch): Promise<TaskList> {
    const { isArchived, ...patch } = input;
    const response = await this.client.updateList(id, {
      ...patch,
      is_archived: isArchived,
    });
    return mapList(response.data);
  }

  async delete(id: string): Promise<void> {
    await this.client.deleteList(id);
  }
}