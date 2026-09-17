import type { HistoryPage } from "@/domain/history/models";

export interface HistoryRepository {
  findPage(input?: { listId?: string; page?: number; pageSize?: number }): Promise<HistoryPage>;
}