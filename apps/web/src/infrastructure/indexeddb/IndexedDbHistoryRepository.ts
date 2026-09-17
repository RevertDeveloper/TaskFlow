import type { HistoryPage } from "@/domain/history/models";
import type { HistoryRepository } from "@/domain/history/ports";
import { openTaskFlowDatabase, taskFlowDatabase, type TaskFlowDatabase } from "./database";
import { assertLocalTaskEventRecord } from "./schema";

export class IndexedDbHistoryRepository implements HistoryRepository {
  constructor(private readonly database: TaskFlowDatabase = taskFlowDatabase) {}

  async findPage(input: { listId?: string; page?: number; pageSize?: number } = {}): Promise<HistoryPage> {
    await openTaskFlowDatabase(this.database);
    const page = positiveInteger(input.page ?? 1, "La página");
    const pageSize = boundedPageSize(input.pageSize ?? 20);
    const taskIds = input.listId === undefined ? null : new Set(
      (await this.database.tasks.where("listId").equals(input.listId).toArray()).map((task) => task.id),
    );
    const records = await this.database.taskEvents.orderBy("createdAt").reverse().toArray();
    const entries = records.filter((record) => {
      assertLocalTaskEventRecord(record);
      return taskIds === null || (record.taskId !== null && taskIds.has(record.taskId));
    });
    const totalCount = entries.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const start = (page - 1) * pageSize;
    return {
      entries: entries.slice(start, start + pageSize),
      page,
      totalPages,
      totalCount,
    };
  }
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