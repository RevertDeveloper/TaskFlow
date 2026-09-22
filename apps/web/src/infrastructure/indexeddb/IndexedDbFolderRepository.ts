import type { Folder, FolderDraft, FolderPatch } from "@/domain/folder/models";
import type { FolderRepository } from "@/domain/folder/ports";
import { createUuid, getDeviceId, openTaskFlowDatabase, taskFlowDatabase, type TaskFlowDatabase } from "./database";
import { LocalStorageError } from "./errors";
import type { JsonObject } from "./schema";

export class IndexedDbFolderRepository implements FolderRepository {
  constructor(private readonly database: TaskFlowDatabase = taskFlowDatabase) {}

  async findAll(): Promise<Folder[]> {
    await openTaskFlowDatabase(this.database);
    const records = await this.database.folders.orderBy("position").toArray();
    return records.filter((record) => record.deletedAt === null).map(toFolder);
  }

  async create(draft: FolderDraft): Promise<Folder> {
    await openTaskFlowDatabase(this.database);
    const now = new Date().toISOString();
    const siblings = await this.database.folders.filter((folder) => folder.parentId === draft.parentId && folder.deletedAt === null).count();
    const folder: Folder = {
      id: createUuid(), parentId: draft.parentId, name: draft.name.trim().slice(0, 120),
      emoji: draft.emoji, position: siblings, deletedAt: null, createdAt: now, updatedAt: now,
    };
    await this.database.folders.add(folder);
    await enqueueFolderSync(this.database, folder, "create");
    notifyLocalChange("folder");
    return folder;
  }

  async update(id: string, patch: FolderPatch): Promise<Folder> {
    await openTaskFlowDatabase(this.database);
    const current = await this.database.folders.get(id);
    if (!current || current.deletedAt !== null) throw new LocalStorageError("unknown", "La carpeta no existe.");
    const folder: Folder = {
      ...toFolder(current), ...patch,
      name: patch.name === undefined ? current.name : patch.name.trim().slice(0, 120),
      updatedAt: new Date().toISOString(),
    };
    await this.database.folders.put(folder);
    await enqueueFolderSync(this.database, folder, "update");
    notifyLocalChange("folder");
    return folder;
  }

  async softDelete(id: string): Promise<void> {
    await openTaskFlowDatabase(this.database);
    const current = await this.database.folders.get(id);
    if (!current) throw new LocalStorageError("unknown", "La carpeta no existe.");
    const deletedAt = new Date().toISOString();
    await this.database.folders.put({ ...current, deletedAt, updatedAt: deletedAt });
    await enqueueFolderSync(this.database, { ...toFolder(current), deletedAt, updatedAt: deletedAt }, "delete");
    notifyLocalChange("folder");
  }
}

function notifyLocalChange(entity: "folder"): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("taskflow:local-change", { detail: entity }));
}

function toFolder(record: { id: string; parentId: string | null; name: string; emoji: string; position: number; deletedAt: string | null; createdAt?: string; updatedAt: string }): Folder {
  return {
    id: record.id, parentId: record.parentId, name: record.name, emoji: record.emoji,
    position: record.position, deletedAt: record.deletedAt,
    createdAt: record.createdAt ?? record.updatedAt, updatedAt: record.updatedAt,
  };
}

async function enqueueFolderSync(database: TaskFlowDatabase, folder: Folder, operation: "create" | "update" | "delete"): Promise<void> {
  const deviceId = await getDeviceId(database);
  const currentVersion = await database.appState.get("client_version");
  const clientVersion = typeof currentVersion?.value === "number" ? currentVersion.value + 1 : 1;
  await database.appState.put({ key: "client_version", value: clientVersion });
  await database.syncOperations.add({
    id: createUuid(), deviceId, entityType: "folder", entityId: folder.id, operation,
    clientVersion, occurredAt: new Date().toISOString(), processedAt: null,
    idempotencyKey: createUuid(), payloadVersion: 1,
    payload: JSON.parse(JSON.stringify(folder)) as JsonObject,
  });
}
