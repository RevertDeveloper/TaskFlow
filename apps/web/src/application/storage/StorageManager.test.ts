import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskFlowApiError } from "@/infrastructure/api/httpClient";
import { openTaskFlowDatabase, TaskFlowDatabase } from "@/infrastructure/indexeddb/database";
import { LocalRepository } from "@/infrastructure/repositories/LocalRepository";
import { StorageManager } from "./StorageManager";
import type { ApiRepositoryBundle } from "@/infrastructure/repositories/apiRepositories";

const databaseNames: string[] = [];

describe("StorageManager", () => {
  afterEach(async () => {
    await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
  });

  it("routes Device and Cloud through the same repository surface", async () => {
    const localRepository = await createLocalRepository();
    const manager = new StorageManager({
      mode: "device",
      localRepository,
      apiRepositories: fakeApiRepositories(),
      syncTransport: idleSyncTransport(),
    });

    expect(Object.keys(manager.repositories).sort()).toEqual(["history", "lists", "sync", "tasks"]);
    await expect(manager.repositories.lists.findAll()).resolves.toEqual([
      expect.objectContaining({ name: "Inbox", isSystem: true }),
    ]);
    await manager.refreshState();
    expect(manager.getSnapshot()).toMatchObject({ mode: "device", authority: "local", source: "local", syncStatus: "disabled" });

    await manager.setMode("cloud");
    expect(manager.getSnapshot().mode).toBe("cloud");
    expect(manager.getSnapshot().authority).toBe("remote");
    expect(manager.repositories.lists).not.toBe(localRepository.lists);
  });

  it("hydrates the local replica after a remote read and reports remote authority", async () => {
    const localRepository = await createLocalRepository();
    const apiRepositories = fakeApiRepositories({
      lists: fakeListRepository(vi.fn().mockResolvedValue([listModel("00000000-0000-4000-8000-000000000001", "Remoto")])),
    });
    const manager = new StorageManager({ mode: "cloud", localRepository, apiRepositories });

    await expect(manager.repositories.lists.findAll()).resolves.toEqual([
      expect.objectContaining({ id: "00000000-0000-4000-8000-000000000001", name: "Remoto" }),
    ]);
    await manager.refreshState();

    expect(manager.getSnapshot()).toMatchObject({
      authority: "remote",
      source: "remote",
      isStale: false,
      availability: "available",
      replicaAvailable: true,
    });
      await expect(localRepository.lists.findAll()).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "Inbox", isSystem: true }),
        expect.objectContaining({ id: "00000000-0000-4000-8000-000000000001", name: "Remoto" }),
      ]));
  });

  it("falls back to the local replica only for unavailable cloud requests", async () => {
    const localRepository = await createLocalRepository();
    const apiRepositories = fakeApiRepositories({ lists: fakeListRepository(vi.fn().mockRejectedValue(new TypeError("network down"))) });
    const manager = new StorageManager({ mode: "cloud", localRepository, apiRepositories });

    await expect(manager.repositories.lists.findAll()).resolves.toEqual([
      expect.objectContaining({ name: "Inbox", isSystem: true }),
    ]);
    await manager.refreshState();
    expect(manager.getSnapshot()).toMatchObject({
      authority: "remote",
      source: "local",
      isStale: true,
      availability: "available",
      syncStatus: "error",
    });
  });

  it("does not hide validation errors with local fallback", async () => {
    const localRepository = await createLocalRepository();
    const apiRepositories = fakeApiRepositories({
      lists: fakeListRepository(vi.fn().mockRejectedValue(new TaskFlowApiError(400, { code: "invalid_request" }))),
    });
    const manager = new StorageManager({ mode: "cloud", localRepository, apiRepositories });

    await expect(manager.repositories.lists.findAll()).rejects.toBeInstanceOf(TaskFlowApiError);
    expect(manager.getSnapshot().source).toBe("unknown");
  });

  it("queues a local cloud mutation when the remote authority is unavailable", async () => {
    const localRepository = await createLocalRepository();
    const apiRepositories = fakeApiRepositories({
      lists: fakeListRepository(vi.fn().mockResolvedValue([]), vi.fn().mockRejectedValue(new TypeError("network down"))),
    });
    const manager = new StorageManager({ mode: "cloud", localRepository, apiRepositories });

    await expect(manager.repositories.lists.create({ name: "Offline" })).resolves.toMatchObject({ name: "Offline" });
    await manager.refreshState();

    expect(manager.getSnapshot()).toMatchObject({ source: "local", isStale: true, pendingOperations: 1, syncStatus: "error" });
    await expect(manager.repositories.sync.findPending()).resolves.toHaveLength(1);
  });

  it("drains cloud sync and exposes the last successful run", async () => {
    const localRepository = await createLocalRepository();
    const syncTransport = {
      push: vi.fn().mockResolvedValue({
        version: 1,
        syncId: "sync-1",
        accepted: [],
        rejected: [],
        conflicts: [],
        changes: [],
      }),
      pull: vi.fn().mockResolvedValue({ version: 1, cursor: "cursor-1", hasMore: false, changes: [] }),
    };
    const manager = new StorageManager({ mode: "cloud", localRepository, syncTransport });

    await expect(manager.syncNow()).resolves.toMatchObject({ status: "idle" });
    expect(syncTransport.pull).toHaveBeenCalledWith(null, 100);
    expect(manager.getSnapshot()).toMatchObject({ syncStatus: "idle", lastSyncedAt: expect.any(String) });
  });

  it("keeps the active mode and local data when Cloud export fails", async () => {
    const localRepository = await createLocalRepository();
    const localList = await localRepository.lists.create({ name: "Conservar" });
    const manager = new StorageManager({
      mode: "cloud",
      localRepository,
      apiRepositories: fakeApiRepositories({
        lists: fakeListRepository(vi.fn().mockRejectedValue(new TypeError("network down"))),
      }),
      syncTransport: idleSyncTransport(),
    });

    await expect(manager.setMode("device")).rejects.toThrow("network down");
    expect(manager.getSnapshot()).toMatchObject({ mode: "cloud", isTransitioning: false });
    await expect(localRepository.lists.findAll()).resolves.toEqual([
      expect.objectContaining({ name: "Inbox" }),
      expect.objectContaining({ id: localList.id, name: "Conservar" }),
    ]);
  });

  it("keeps local reset separate from Cloud reset and requires strong confirmation", async () => {
    const localRepository = await createLocalRepository();
    await localRepository.lists.create({ name: "Local" });
    const resetCloud = vi.fn().mockResolvedValue(undefined);
    const manager = new StorageManager({
      mode: "device",
      localRepository,
      apiRepositories: fakeApiRepositories({ resetCloud }),
      syncTransport: idleSyncTransport(),
    });

    await manager.resetLocal();
    expect(resetCloud).not.toHaveBeenCalled();
    await expect(localRepository.lists.findAll()).resolves.toEqual([
      expect.objectContaining({ name: "Inbox", isSystem: true }),
    ]);
    await expect(manager.resetCloud("RESET")).rejects.toThrow("confirmacion");
    expect(resetCloud).not.toHaveBeenCalled();
    await manager.resetCloud("RESET TASKFLOW DATA");
    expect(resetCloud).toHaveBeenCalledWith("RESET TASKFLOW DATA");
  });
});

async function createLocalRepository(): Promise<LocalRepository> {
  const database = new TaskFlowDatabase(`taskflow-storage-manager-${crypto.randomUUID()}`);
  databaseNames.push(database.name);
  await openTaskFlowDatabase(database);
  return new LocalRepository({ database });
}

function fakeApiRepositories(overrides: Partial<ApiRepositoryBundle> = {}): ApiRepositoryBundle {
  return {
    lists: fakeListRepository(),
    tasks: {
      findAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(taskModel()),
      update: vi.fn().mockResolvedValue(taskModel()),
      complete: vi.fn().mockResolvedValue(taskModel()),
      reopen: vi.fn().mockResolvedValue(taskModel()),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    history: {
      findPage: vi.fn().mockResolvedValue({ entries: [], page: 1, totalPages: 1, totalCount: 0 }),
    },
    ...overrides,
  };
}

function fakeListRepository(
  findAll: ApiRepositoryBundle["lists"]["findAll"] = vi.fn().mockResolvedValue([]),
  create: ApiRepositoryBundle["lists"]["create"] = vi.fn().mockResolvedValue(listModel()),
): ApiRepositoryBundle["lists"] {
  return {
    findAll,
    create,
    update: vi.fn().mockResolvedValue(listModel()),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function listModel(id = "00000000-0000-4000-8000-000000000002", name = "Lista", isSystem = false) {
  return {
    id,
    name,
    description: "",
    emoji: "",
    color: "",
    position: 0,
    isArchived: false,
    isSystem,
  };
}

function taskModel() {
  return { id: "task-a", listId: "list-a", title: "Tarea", description: "", status: "pending" as const, source: "manual" as const, position: 0, completedAt: null, createdAt: "2026-09-17T10:00:00Z", updatedAt: "2026-09-17T10:00:00Z" };
}

function idleSyncTransport() {
  return {
    push: vi.fn().mockResolvedValue({ version: 1, syncId: "sync-1", accepted: [], rejected: [], conflicts: [], changes: [] }),
    pull: vi.fn().mockResolvedValue({ version: 1, cursor: null, hasMore: false, changes: [] }),
  };
}