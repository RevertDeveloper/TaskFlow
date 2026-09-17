import type { SyncOperation } from "@/domain/sync/models";
import type { SyncRepository } from "@/domain/sync/ports";
import { APP_STATE_KEYS } from "./schema";
import { openTaskFlowDatabase, taskFlowDatabase, type TaskFlowDatabase } from "./database";
import { LocalStorageError, LocalStorageValidationError } from "./errors";
import { assertLocalSyncOperationRecord, type LocalSyncOperationRecord } from "./schema";

export class IndexedDbSyncRepository implements SyncRepository {
  constructor(private readonly database: TaskFlowDatabase = taskFlowDatabase) {}

  async findPending(limit = 100): Promise<SyncOperation[]> {
    await openTaskFlowDatabase(this.database);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError("El límite de operaciones debe estar entre 1 y 500.");
    }
    const records = await this.database.syncOperations
      .filter((record) => record.processedAt === null)
      .sortBy("occurredAt");
    return records.slice(0, limit).map((record) => {
      assertLocalSyncOperationRecord(record);
      return toSyncOperation(record);
    });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<SyncOperation | null> {
    await openTaskFlowDatabase(this.database);
    const record = await this.database.syncOperations.where("idempotencyKey").equals(idempotencyKey).first();
    if (!record) {
      return null;
    }
    assertLocalSyncOperationRecord(record);
    return toSyncOperation(record);
  }

  async markProcessed(id: string, processedAt = new Date().toISOString()): Promise<void> {
    await openTaskFlowDatabase(this.database);
    const record = await this.database.syncOperations.get(id);
    if (!record) {
      throw new LocalStorageError("unknown", "La operación de sincronización no existe en el dispositivo.");
    }
    assertLocalSyncOperationRecord(record);
    await this.database.syncOperations.put({ ...record, processedAt });
  }

  async getCursor(): Promise<string | null> {
    await openTaskFlowDatabase(this.database);
    const record = await this.database.appState.get(APP_STATE_KEYS.syncCursor);
    if (!record) {
      return null;
    }
    if (record?.value === null || typeof record?.value === "string") {
      return record?.value ?? null;
    }
    throw new LocalStorageValidationError("El cursor local de sincronización está corrupto.");
  }

  async setCursor(cursor: string | null): Promise<void> {
    await openTaskFlowDatabase(this.database);
    if (cursor !== null && typeof cursor !== "string") {
      throw new LocalStorageValidationError("El cursor de sincronización no es válido.");
    }
    await this.database.appState.put({ key: APP_STATE_KEYS.syncCursor, value: cursor });
  }
}

function toSyncOperation(record: LocalSyncOperationRecord): SyncOperation {
  return {
    ...record,
    payload: { ...record.payload },
  };
}