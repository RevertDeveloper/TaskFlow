import type { HistoryPage } from "./models";

export interface HistoryRepository {
  findPage(input?: { listId?: string; page?: number; pageSize?: number }): Promise<HistoryPage>;
}