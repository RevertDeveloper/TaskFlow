import type { AuthUser } from "@/domain/auth/models";
import type { TaskList } from "@/domain/list/models";
import type { StorageRepositoryBundle } from "./StorageManager";
import { StorageManager } from "./StorageManager";
import { configuredStorageMode, type StorageMode } from "./StorageMode";
import type { StorageState, StorageStateListener } from "./StorageState";
import type { ApiRepositoryBundle } from "@/infrastructure/repositories/apiRepositories";

type ProfileStorageOptions = {
  apiRepositories?: ApiRepositoryBundle;
};

export class ProfileStorageManager {
  private readonly managers = new Map<string, StorageManager>();
  private readonly listeners = new Set<StorageStateListener>();
  private readonly apiRepositories: ApiRepositoryBundle | undefined;
  private activeProfile = "anonymous";
  private activeManager: StorageManager;
  private unsubscribeActive: (() => void) | null = null;
  private transition: Promise<void> | null = null;

  constructor(options: ProfileStorageOptions = {}) {
    this.apiRepositories = options.apiRepositories;
    this.activeManager = this.getOrCreateManager("anonymous", "device");
    this.subscribeToActiveManager();
  }

  get repositories(): StorageRepositoryBundle {
    return this.activeManager.repositories;
  }

  getSnapshot(): StorageState {
    return this.activeManager.getSnapshot();
  }

  subscribe(listener: StorageStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setUser(user: AuthUser | null): Promise<void> {
    const nextProfile = user ? accountProfile(user.id) : "anonymous";
    if (nextProfile === this.activeProfile) {
      return;
    }
    if (this.transition) {
      await this.transition;
      if (nextProfile === this.activeProfile) {
        return;
      }
    }
    const transition = this.switchProfile(nextProfile, user);
    this.transition = transition.finally(() => {
      this.transition = null;
    });
    await this.transition;
  }

  async refreshState(): Promise<StorageState> {
    return this.activeManager.refreshState();
  }

  async setMode(mode: StorageMode): Promise<void> {
    if (this.activeProfile === "anonymous" && mode === "cloud") {
      throw new Error("Inicia sesión para activar el almacenamiento Cloud.");
    }
    await this.activeManager.setMode(mode);
  }

  syncNow(): Promise<ReturnType<StorageManager["syncNow"]> extends Promise<infer Result> ? Result : never> {
    return this.activeManager.syncNow();
  }

  resetLocal(): Promise<void> {
    return this.activeManager.resetLocal();
  }

  resetCloud(confirmation: string): Promise<void> {
    return this.activeManager.resetCloud(confirmation);
  }

  private async switchProfile(nextProfile: string, user: AuthUser | null): Promise<void> {
    const previousManager = this.activeManager;
    const nextManager = this.getOrCreateManager(
      nextProfile,
      user ? configuredStorageMode() : "device",
    );

    if (user && this.activeProfile === "anonymous") {
      await mergeAnonymousWorkspace(previousManager, nextManager);
    }

    this.unsubscribeActive?.();
    this.activeProfile = nextProfile;
    this.activeManager = nextManager;
    this.subscribeToActiveManager();
    this.emit();
    await this.activeManager.refreshState();
  }

  private getOrCreateManager(profile: string, mode: "cloud" | "device"): StorageManager {
    const existing = this.managers.get(profile);
    if (existing) {
      return existing;
    }
    const manager = new StorageManager({
      mode,
      databaseName: databaseNameForProfile(profile),
      apiRepositories: this.apiRepositories,
    });
    this.managers.set(profile, manager);
    return manager;
  }

  private subscribeToActiveManager(): void {
    this.unsubscribeActive = this.activeManager.subscribe((state) => {
      this.listeners.forEach((listener) => listener(state));
    });
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.activeManager.getSnapshot()));
  }
}

async function mergeAnonymousWorkspace(source: StorageManager, target: StorageManager): Promise<void> {
  const [anonymousLists, anonymousTasks, accountLists, accountTasks, localAccountLists] = await Promise.all([
    source.repositories.lists.findAll(),
    source.repositories.tasks.findAll(),
    target.repositories.lists.findAll(),
    target.repositories.tasks.findAll(),
    target.getLocalRepository().lists.findAll(),
  ]);
  const knownAccountLists = mergeUniqueLists(accountLists, localAccountLists);
  const accountInbox = knownAccountLists.find((list) => list.isSystem);
  if (!accountInbox) {
    throw new Error("La cuenta no tiene una lista Inbox disponible para fusionar el espacio local.");
  }

  const listIds = new Map<string, string>();
  const accountListByKey = new Map(knownAccountLists.map((list) => [listKey(list.name, list.description), list]));
  for (const list of anonymousLists) {
    if (list.isSystem) {
      listIds.set(list.id, accountInbox.id);
      continue;
    }
    const key = listKey(list.name, list.description);
    const existing = accountListByKey.get(key);
    const merged = existing ?? await target.repositories.lists.create({
      name: list.name,
      description: list.description,
      emoji: list.emoji,
      color: list.color,
    });
    accountListByKey.set(key, merged);
    listIds.set(list.id, merged.id);
  }

  const accountTaskKeys = new Set(accountTasks.map((task) => taskKey(task.listId, task.title, task.description)));
  for (const task of anonymousTasks) {
    const listId = listIds.get(task.listId) ?? accountInbox.id;
    const key = taskKey(listId, task.title, task.description);
    if (accountTaskKeys.has(key)) {
      continue;
    }
    await target.repositories.tasks.create({
      listId,
      title: task.title,
      description: task.description,
    });
    accountTaskKeys.add(key);
  }
}

function mergeUniqueLists(primary: TaskList[], secondary: TaskList[]): TaskList[] {
  const lists = new Map(primary.map((list) => [list.id, list]));
  secondary.forEach((list) => lists.set(list.id, list));
  return [...lists.values()];
}

function accountProfile(userId: number): string {
  return `account-${userId}`;
}

function databaseNameForProfile(profile: string): string {
  return `taskflow-local-${profile}`;
}

function listKey(name: string, description: string): string {
  return `${name.trim().toLocaleLowerCase()}\u0000${description.trim()}`;
}

function taskKey(listId: string, title: string, description: string): string {
  return `${listId}\u0000${title.trim().toLocaleLowerCase()}\u0000${description.trim()}`;
}