import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthUser } from "@/domain/auth/models";
import type { ApiRepositoryBundle } from "@/infrastructure/repositories/apiRepositories";
import type { TaskList } from "@/domain/list/models";
import { ProfileStorageManager } from "./ProfileStorageManager";

const profileDatabaseNames = [
  "taskflow-local-anonymous",
  "taskflow-local-account-7",
  "taskflow-local-account-8",
];

describe("ProfileStorageManager", () => {
  afterEach(async () => {
    await Promise.all(profileDatabaseNames.map((name) => Dexie.delete(name)));
  });

  it("fuses local lists into the authenticated profile", async () => {
    const createdRemoteLists: TaskList[] = [];
    const manager = new ProfileStorageManager({
      apiRepositories: fakeApiRepositories(createdRemoteLists),
    });

    const localList = await manager.repositories.lists.create({ name: "Trabajo", description: "TFM" });
    await manager.setUser(user(7));

    expect(createdRemoteLists).toEqual([
      expect.objectContaining({ name: "Trabajo", description: "TFM" }),
    ]);
    expect(await manager.repositories.lists.findAll()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Trabajo" })]),
    );
    expect(localList.id).not.toBe(createdRemoteLists[0]?.id);
  });

  it("does not expose one account replica after switching accounts", async () => {
    let remoteAvailable = true;
    const accountOneList: TaskList = listModel("Cuenta uno");
    const manager = new ProfileStorageManager({
      apiRepositories: fakeApiRepositories([], {
        findAll: vi.fn(async () => {
          if (!remoteAvailable) {
            throw new TypeError("network down");
          }
          return [];
        }),
        create: vi.fn().mockResolvedValue(accountOneList),
      }),
    });

    await manager.setUser(user(7));
    await manager.repositories.lists.create({ name: accountOneList.name });
    await manager.setUser(null);
    await manager.setUser(user(8));
    remoteAvailable = false;

    const accountTwoLists = await manager.repositories.lists.findAll();
    expect(accountTwoLists).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "Cuenta uno" })]));
  });
});

function user(id: number): AuthUser {
  return {
    id,
    username: `user-${id}`,
    email: `user-${id}@example.com`,
    email_verified: true,
    first_name: "",
    last_name: "",
    plan: null,
  };
}

function fakeApiRepositories(createdLists: TaskList[], listOverrides: Partial<ApiRepositoryBundle["lists"]> = {}): ApiRepositoryBundle {
  return {
    lists: {
      findAll: vi.fn().mockImplementation(async () => createdLists),
      create: vi.fn(async (input) => {
        const list = listModel(input.name, input.description);
        createdLists.push(list);
        return list;
      }),
      update: vi.fn().mockResolvedValue(listModel("Actualizada")),
      delete: vi.fn().mockResolvedValue(undefined),
      ...listOverrides,
    },
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
  };
}

function listModel(name: string, description = ""): TaskList {
  return {
    id: `remote-${name.toLowerCase().replaceAll(" ", "-")}`,
    name,
    description,
    emoji: "",
    color: "",
    position: 1,
    isArchived: false,
    isSystem: false,
  };
}

function taskModel() {
  return {
    id: "task-a",
    listId: "list-a",
    title: "Tarea",
    description: "",
    status: "pending" as const,
    source: "manual" as const,
    position: 0,
    completedAt: null,
    createdAt: "2026-09-17T10:00:00Z",
    updatedAt: "2026-09-17T10:00:00Z",
  };
}