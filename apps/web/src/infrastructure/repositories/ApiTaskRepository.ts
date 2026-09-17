import type { Task, TaskDraft, TaskPatch } from "@/domain/task/models";
import type { TaskRepository } from "@/domain/repositories/TaskRepository";
import { api } from "@/infrastructure/api/httpClient";
import type { TaskFlowApiClient } from "./ApiRepositorySupport";
import { collectPages, mapTask, pageQuery, toTaskCreate } from "./ApiRepositorySupport";

export class ApiTaskRepository implements TaskRepository {
  constructor(private readonly client: TaskFlowApiClient = api) {}

  async findAll(): Promise<Task[]> {
    return collectPages((page) => this.client.tasks(pageQuery(page))).then((items) => items.map(mapTask));
  }

  async create(input: TaskDraft): Promise<Task> {
    const response = await this.client.createTask(toTaskCreate(input));
    return mapTask(response.data);
  }

  async update(id: string, input: TaskPatch): Promise<Task> {
    const response = await this.client.updateTask(id, {
      list_id: input.listId,
      title: input.title,
      description: input.description,
    });
    return mapTask(response.data);
  }

  async complete(id: string): Promise<Task> {
    const response = await this.client.completeTask(id);
    return mapTask(response.data);
  }

  async reopen(id: string): Promise<Task> {
    const response = await this.client.reopenTask(id);
    return mapTask(response.data);
  }

  async delete(id: string): Promise<void> {
    await this.client.deleteTask(id);
  }
}