import type { HistoryRepository } from "@/domain/repositories/HistoryRepository";
import type { ListRepository } from "@/domain/repositories/ListRepository";
import type { SyncRepository } from "@/domain/repositories/SyncRepository";
import type { SyncRunResult } from "@/domain/sync/models";
import type { TaskRepository } from "@/domain/repositories/TaskRepository";
import { SyncEngine } from "@/features/sync/SyncEngine";
import { HttpSyncTransport, type SyncTransport } from "@/features/sync/SyncTransport";
import { taskFlowApiRepositories, type ApiRepositoryBundle } from "@/infrastructure/repositories/apiRepositories";
import { CloudRepository } from "@/infrastructure/repositories/CloudRepository";
import { LocalRepository } from "@/infrastructure/repositories/LocalRepository";
import { LocalReplica } from "@/infrastructure/repositories/LocalReplica";
import { configuredStorageMode, type StorageMode } from "./StorageMode";
import type { StorageState, StorageStateListener } from "./StorageState";

export type StorageRepositoryBundle = {
  lists: ListRepository;
  tasks: TaskRepository;
  history: HistoryRepository;
  sync: SyncRepository;
};

export type StorageManagerOptions = {
  mode?: StorageMode;
  localRepository?: LocalRepository;
  apiRepositories?: ApiRepositoryBundle;
  syncTransport?: SyncTransport;
};

export class StorageManager {
  private mode: StorageMode;
  private readonly localRepository: LocalRepository;
  private readonly apiRepositories: ApiRepositoryBundle;
  private readonly syncTransport: SyncTransport;
  private readonly listeners = new Set<StorageStateListener>();
  private repositoriesValue: StorageRepositoryBundle;
  private state: StorageState;
  private syncEngine: SyncEngine | null = null;

  constructor(options: StorageManagerOptions = {}) {
    this.mode = options.mode ?? configuredStorageMode();
    this.localRepository = options.localRepository ?? new LocalRepository();
    this.apiRepositories = options.apiRepositories ?? taskFlowApiRepositories;
    this.syncTransport = options.syncTransport ?? new HttpSyncTransport();
    this.state = createInitialState(this.mode);
    this.repositoriesValue = this.createRepositories();
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
    }
  }

  get repositories(): StorageRepositoryBundle {
    return this.repositoriesValue;
  }

  getSnapshot(): StorageState {
    return this.state;
  }

  subscribe(listener: StorageStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setMode(mode: StorageMode): void {
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    this.state = createInitialState(mode);
    this.repositoriesValue = this.createRepositories();
    this.emit();
    void this.refreshState();
  }

  async syncNow(): Promise<SyncRunResult> {
    if (this.mode === "device" || !this.syncEngine) {
      return { status: "paused", pushed: 0, pulled: 0, conflicts: 0, retries: 0, error: null };
    }
    this.state = { ...this.state, syncStatus: "pending", error: null };
    this.emit();
    const result = await this.syncEngine.run();
    const pendingOperations = await this.localRepository.sync.findPending(500);
    this.state = {
      ...this.state,
      pendingOperations: pendingOperations.length,
      syncStatus: result.status === "paused"
        ? "paused"
        : result.status === "error"
          ? "error"
          : pendingOperations.length > 0 ? "pending" : "idle",
      lastSyncedAt: result.status === "synced" || result.status === "idle"
        ? new Date().toISOString()
        : this.state.lastSyncedAt,
      error: result.error,
    };
    this.emit();
    return result;
  }

  async refreshState(): Promise<StorageState> {
    try {
      const pendingOperations = (await this.localRepository.sync.findPending(500)).length;
      this.state = {
        ...this.state,
        pendingOperations,
        availability: "available",
        syncStatus: this.mode === "device"
          ? "disabled"
          : this.state.syncStatus === "error" ? "error" : pendingOperations > 0 ? "pending" : "idle",
        error: this.state.syncStatus === "error" ? this.state.error : null,
      };
    } catch (error) {
      this.state = {
        ...this.state,
        availability: "unavailable",
        syncStatus: this.mode === "device" ? "disabled" : "error",
        error: errorMessage(error),
      };
    }
    this.emit();
    return this.state;
  }

  private createRepositories(): StorageRepositoryBundle {
    if (this.mode === "device") {
      this.syncEngine = null;
      return {
        lists: this.localRepository.lists,
        tasks: this.localRepository.tasks,
        history: this.localRepository.history,
        sync: this.localRepository.sync,
      };
    }

    this.syncEngine = new SyncEngine(this.localRepository.sync, this.syncTransport, {
      replica: new LocalReplica(this.localRepository.getDatabase()),
    });
    const cloud = new CloudRepository(this.apiRepositories, this.localRepository, {
      callbacks: {
        onRemoteSuccess: (replicaAvailable) => {
          this.state = {
            ...this.state,
            source: "remote",
            isStale: !replicaAvailable,
            availability: "available",
            lastRemoteSuccessAt: new Date().toISOString(),
            syncStatus: this.state.pendingOperations > 0 ? "pending" : "idle",
            error: replicaAvailable ? null : this.state.error,
            replicaAvailable,
          };
          this.emit();
        },
        onLocalFallback: (error) => {
          this.state = {
            ...this.state,
            source: "local",
            isStale: true,
            availability: "available",
            syncStatus: "error",
            error: errorMessage(error),
          };
          this.emit();
        },
        onReplicaFailure: (error) => {
          this.state = {
            ...this.state,
            isStale: true,
            replicaAvailable: false,
            error: errorMessage(error),
          };
          this.emit();
        },
        onMutation: () => {
          void this.refreshState();
        },
      },
    });
    return {
      lists: cloud.lists,
      tasks: cloud.tasks,
      history: cloud.history,
      sync: cloud.sync,
    };
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  private readonly handleOnline = (): void => {
    void this.syncNow();
  };
}

export const defaultStorageManager = new StorageManager();

function createInitialState(mode: StorageMode): StorageState {
  return {
    mode,
    authority: mode === "cloud" ? "remote" : "local",
    source: mode === "cloud" ? "unknown" : "local",
    isStale: false,
    pendingOperations: 0,
    lastRemoteSuccessAt: null,
    lastSyncedAt: null,
    syncStatus: mode === "cloud" ? "idle" : "disabled",
    availability: "loading",
    replicaAvailable: true,
    error: null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo consultar el estado del almacenamiento.";
}