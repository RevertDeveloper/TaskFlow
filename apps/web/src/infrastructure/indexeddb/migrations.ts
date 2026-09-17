import type Dexie from "dexie";
import {
  APP_STATE_KEYS,
  CURRENT_SCHEMA_VERSION,
  SCHEMA_V1,
  SCHEMA_V2,
} from "./schema";

export function registerMigrations(database: Dexie): void {
  database.version(1).stores(SCHEMA_V1);
  database.version(CURRENT_SCHEMA_VERSION).stores(SCHEMA_V2).upgrade((transaction) => {
    return Promise.all([
      transaction.table("lists").toCollection().modify((record: Record<string, unknown>) => {
        record.description ??= "";
        record.emoji ??= "";
        record.color ??= "";
        record.isArchived ??= false;
        record.isSystem ??= false;
        record.createdAt ??= record.updatedAt ?? new Date().toISOString();
        record.deletedAt ??= null;
      }),
      transaction.table("tasks").toCollection().modify((record: Record<string, unknown>) => {
        record.description ??= "";
        record.status ??= "pending";
        record.source ??= "manual";
        record.position ??= 0;
        record.completedAt ??= null;
        record.createdAt ??= record.updatedAt ?? new Date().toISOString();
        record.updatedAt ??= record.createdAt;
        record.deletedAt ??= null;
      }),
      transaction.table("task_events").toCollection().modify((record: Record<string, unknown>) => {
        record.taskId ??= null;
        record.payload ??= {};
      }),
      transaction.table("app_state").put({
        key: APP_STATE_KEYS.schemaVersion,
        value: CURRENT_SCHEMA_VERSION,
      }),
    ]);
  });
}