import type { HistoryPage } from "@/domain/history/models";
import type { HistoryRepository } from "@/domain/repositories/HistoryRepository";
import { api } from "@/infrastructure/api/httpClient";
import type { TaskFlowApiClient } from "./ApiRepositorySupport";
import { mapHistory } from "./ApiRepositorySupport";

export class ApiHistoryRepository implements HistoryRepository {
  constructor(private readonly client: TaskFlowApiClient = api) {}

  async findPage(input: { listId?: string; page?: number; pageSize?: number } = {}): Promise<HistoryPage> {
    const params = new URLSearchParams({
      page: String(input.page ?? 1),
      page_size: String(input.pageSize ?? 20),
    });
    if (input.listId) {
      params.set("list_id", input.listId);
    }
    const response = input.listId
      ? await this.client.listHistory(input.listId, `?${params.toString()}`)
      : await this.client.history(`?${params.toString()}`);
    return {
      entries: response.data.map(mapHistory),
      page: response.meta.page,
      totalPages: response.meta.total_pages,
      totalCount: response.meta.total_count,
    };
  }
}