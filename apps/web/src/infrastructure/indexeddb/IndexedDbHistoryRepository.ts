import type { HistoryPage } from "@/domain/history/models";
import type { HistoryRepository } from "@/domain/history/ports";
import { openTaskFlowDatabase, taskFlowDatabase, type TaskFlowDatabase } from "./database";
import { assertLocalTaskEventRecord, type LocalTaskEventRecord } from "./schema";

export class IndexedDbHistoryRepository implements HistoryRepository {
  constructor(private readonly database: TaskFlowDatabase = taskFlowDatabase) {}

  async findPage(input: { listId?: string; page?: number; pageSize?: number } = {}): Promise<HistoryPage> {
    await openTaskFlowDatabase(this.database);
    const page = positiveInteger(input.page ?? 1, "La página");
    const pageSize = boundedPageSize(input.pageSize ?? 20);
    if (input.listId === undefined) {
      const totalCount = await this.database.taskEvents.count();
      const start = (page - 1) * pageSize;
      const entries = await this.database.taskEvents
        .orderBy("createdAt")
        .reverse()
        .offset(start)
        .limit(pageSize)
        .toArray();
      entries.forEach(assertLocalTaskEventRecord);
      return buildPage(entries, page, pageSize, totalCount);
    }

    const taskIds = new Set(
      (await this.database.tasks.where("listId").equals(input.listId).toArray()).map((task) => task.id),
    );
    const records = taskIds.size === 0
      ? []
      : await this.database.taskEvents.where("taskId").anyOf([...taskIds]).sortBy("createdAt");
    const entries = records.reverse().map((record) => {
      assertLocalTaskEventRecord(record);
      return record;
    });
    const totalCount = entries.length;
    const start = (page - 1) * pageSize;
    return buildPage(entries.slice(start, start + pageSize), page, pageSize, totalCount);
  }
}

function buildPage(
  entries: LocalTaskEventRecord[],
  page: number,
  pageSize: number,
  totalCount: number,
): HistoryPage {
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    return {
  entries,
      page,
      totalPages,
      totalCount,
    };
}

function positiveInteger(value: number, context: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${context} debe ser un entero positivo.`);
  }
  return value;
}

function boundedPageSize(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new RangeError("El tamaño de página debe estar entre 1 y 100.");
  }
  return value;
}