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
import { TaskFlowDatabase } from "@/infrastructure/indexeddb/database";
import { configuredStorageMode, type StorageMode } from "./StorageMode";
import { SnapshotService } from "./SnapshotService";
import type { StorageState, StorageStateListener } from "./StorageState";

export type StorageRepositoryBundle = {
  lists: ListRepository;
  tasks: TaskRepository;
  history: HistoryRepository;
  sync: SyncRepository;
};

export type StorageManagerOptions = {
  mode?: StorageMode;
  databaseName?: string;
  localRepository?: LocalRepository;
  apiRepositories?: ApiRepositoryBundle;
  syncTransport?: SyncTransport;
  snapshotService?: SnapshotService;
};

export class StorageManager {
  private mode: StorageMode;
  private readonly localRepository: LocalRepository;
  private readonly apiRepositories: ApiRepositoryBundle;
  private readonly syncTransport: SyncTransport;
  private readonly snapshotService: SnapshotService;
  private readonly listeners = new Set<StorageStateListener>();
  private repositoriesValue: StorageRepositoryBundle;
  private state: StorageState;
  private syncEngine: SyncEngine | null = null;
  private modeTransition: Promise<void> | null = null;
  private syncRetryTimer: number | null = null;
  private syncRetryAttempt = 0;

  constructor(options: StorageManagerOptions = {}) {
    this.mode = options.mode ?? configuredStorageMode();
    this.localRepository = options.localRepository ?? new LocalRepository({
      database: options.databaseName ? new TaskFlowDatabase(options.databaseName) : undefined,
    });
    this.apiRepositories = options.apiRepositories ?? taskFlowApiRepositories;
    this.syncTransport = options.syncTransport ?? new HttpSyncTransport();
    this.snapshotService = options.snapshotService ?? new SnapshotService(
      this.localRepository.getDatabase(),
      this.localRepository,
      this.apiRepositories,
    );
    this.state = createInitialState(this.mode);
    this.repositoriesValue = this.createRepositories();
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }
  }

  get repositories(): StorageRepositoryBundle {
    return this.repositoriesValue;
  }

  getSnapshot(): StorageState {
    return this.state;
  }

  getLocalRepository(): LocalRepository {
    return this.localRepository;
  }

  subscribe(listener: StorageStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setMode(mode: StorageMode): Promise<void> {
    if (mode === this.mode) {
      return;
    }
    if (this.modeTransition) {
      throw new StorageModeTransitionError("Ya hay un cambio de modo en curso.");
    }
    const transition = this.transitionTo(mode);
    this.modeTransition = transition.finally(() => {
      this.modeTransition = null;
    });
    return this.modeTransition;
  }

  async resetLocal(): Promise<void> {
    await this.snapshotService.resetLocal();
    this.repositoriesValue = this.createRepositories();
    this.state = createInitialState(this.mode);
    this.emit();
    await this.refreshState();
  }

  async resetCloud(confirmation: string): Promise<void> {
    if (confirmation !== "RESET TASKFLOW DATA") {
      throw new StorageModeTransitionError("La confirmacion para borrar Cloud no es valida.");
    }
    if (!this.apiRepositories.resetCloud) {
      throw new StorageModeTransitionError("El borrado remoto de TaskFlow no esta configurado.");
    }
    await this.apiRepositories.resetCloud(confirmation);
    await this.resetLocal();
  }

  async syncNow(): Promise<SyncRunResult> {
    if (this.mode === "device" || !this.syncEngine) {
      return { status: "paused", pushed: 0, pulled: 0, conflicts: 0, retries: 0, error: null };
    }
    this.state = { ...this.state, syncStatus: "syncing", error: null };
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
    if (result.status === "error" && pendingOperations.length > 0) {
      this.scheduleSyncRetry();
    } else if (pendingOperations.length === 0) {
      this.syncRetryAttempt = 0;
    }
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
        onQueuedMutation: () => {
          this.scheduleSyncRetry();
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

  private async transitionTo(targetMode: StorageMode): Promise<void> {
    const backup = await this.snapshotService.captureLocalDatabase();
    this.state = { ...this.state, isTransitioning: true, error: null, availability: "loading" };
    this.emit();
    try {
      if (targetMode === "device") {
        const remoteSnapshot = await this.snapshotService.exportRemote();
        await this.snapshotService.importLocal(remoteSnapshot);
      } else {
        const localSnapshot = await this.snapshotService.exportLocal();
        await parseAndValidateSnapshot(localSnapshot);
        const transitionSync = new SyncEngine(
          this.localRepository.sync,
          this.syncTransport,
          { replica: new LocalReplica(this.localRepository.getDatabase()) },
        );
        const syncResult = await transitionSync.run();
        if (syncResult.status === "error" || syncResult.status === "paused") {
          throw new StorageModeTransitionError(
            syncResult.error ?? "No se pudo completar la sincronizacion antes de activar Cloud.",
          );
        }
        const pending = await this.localRepository.sync.findPending(500);
        if (pending.length > 0) {
          throw new StorageModeTransitionError("Quedan operaciones pendientes antes de activar Cloud.");
        }
        const remoteSnapshot = await this.snapshotService.exportRemote();
        await this.snapshotService.importLocal(remoteSnapshot);
      }
      this.mode = targetMode;
      this.repositoriesValue = this.createRepositories();
      this.state = createInitialState(targetMode);
      this.emit();
      await this.refreshState();
    } catch (error) {
      await this.snapshotService.restoreLocalDatabase(backup);
      this.state = {
        ...this.state,
        isTransitioning: false,
        availability: "available",
        error: errorMessage(error),
      };
      this.emit();
      throw error;
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  private readonly handleOnline = (): void => {
    this.cancelScheduledSync();
    void this.syncNow();
  };

  private readonly handleOffline = (): void => {
    if (this.mode === "cloud") {
      this.state = { ...this.state, syncStatus: "paused", error: null };
      this.emit();
    }
  };

  private scheduleSyncRetry(): void {
    if (typeof window === "undefined" || this.mode !== "cloud" || this.syncRetryTimer !== null) {
      return;
    }
    const delayMs = Math.min(30_000, 1_000 * 2 ** this.syncRetryAttempt);
    this.syncRetryAttempt = Math.min(this.syncRetryAttempt + 1, 5);
    this.syncRetryTimer = window.setTimeout(() => {
      this.syncRetryTimer = null;
      void this.syncNow();
    }, delayMs);
  }

  private cancelScheduledSync(): void {
    if (this.syncRetryTimer !== null) {
      window.clearTimeout(this.syncRetryTimer);
      this.syncRetryTimer = null;
    }
  }
}

export const defaultStorageManager = new StorageManager();

function createInitialState(mode: StorageMode): StorageState {
  return {
    mode,
    isTransitioning: false,
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

async function parseAndValidateSnapshot(snapshot: Awaited<ReturnType<SnapshotService["exportLocal"]>>): Promise<void> {
  const { parseSnapshot } = await import("./Snapshot");
  await parseSnapshot(snapshot);
}

export class StorageModeTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageModeTransitionError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo consultar el estado del almacenamiento.";
}