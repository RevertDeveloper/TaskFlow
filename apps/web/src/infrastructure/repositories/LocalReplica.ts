import type { HistoryEntry } from "@/domain/history/models";
import type { TaskList } from "@/domain/list/models";
import type { Task } from "@/domain/task/models";
import { openTaskFlowDatabase, taskFlowDatabase, type TaskFlowDatabase } from "@/infrastructure/indexeddb/database";
import type { LocalListRecord, LocalTaskRecord } from "@/infrastructure/indexeddb/schema";

export class LocalReplica {
  constructor(private readonly database: TaskFlowDatabase = taskFlowDatabase) {}

  async saveLists(lists: TaskList[]): Promise<void> {
    await openTaskFlowDatabase(this.database);
    await this.database.transaction("rw", this.database.lists, async () => {
      const now = new Date().toISOString();
      for (const list of lists) {
        const existing = await this.database.lists.get(list.id);
        const record: LocalListRecord = {
          ...list,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          deletedAt: null,
        };
        await this.database.lists.put(record);
      }
    });
  }

  async saveTasks(tasks: Task[]): Promise<void> {
    await openTaskFlowDatabase(this.database);
    await this.database.transaction("rw", this.database.tasks, async () => {
      const now = new Date().toISOString();
      for (const task of tasks) {
        const existing = await this.database.tasks.get(task.id);
        const record: LocalTaskRecord = {
          ...task,
          createdAt: existing?.createdAt ?? task.createdAt ?? now,
          updatedAt: task.updatedAt ?? now,
          deletedAt: null,
        };
        await this.database.tasks.put(record);
      }
    });
  }

  async saveHistory(entries: HistoryEntry[]): Promise<void> {
    await openTaskFlowDatabase(this.database);
    await this.database.transaction("rw", this.database.taskEvents, async () => {
      await this.database.taskEvents.bulkPut(entries);
    });
  }

  async markListDeleted(id: string): Promise<void> {
    await openTaskFlowDatabase(this.database);
    const record = await this.database.lists.get(id);
    if (record) {
      await this.database.lists.put({ ...record, deletedAt: new Date().toISOString() });
    }
  }

  async markTaskDeleted(id: string): Promise<void> {
    await openTaskFlowDatabase(this.database);
    const record = await this.database.tasks.get(id);
    if (record) {
      await this.database.tasks.put({ ...record, deletedAt: new Date().toISOString() });
    }
  }
}