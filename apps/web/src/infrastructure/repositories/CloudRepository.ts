import type { HistoryPage } from "@/domain/history/models";
import type { ListDraft, ListPatch, TaskList } from "@/domain/list/models";
import type { HistoryRepository } from "@/domain/repositories/HistoryRepository";
import type { ListRepository } from "@/domain/repositories/ListRepository";
import type { TaskRepository } from "@/domain/repositories/TaskRepository";
import type { Task, TaskDraft, TaskPatch } from "@/domain/task/models";
import { TaskFlowApiError } from "@/infrastructure/api/httpClient";
import type { ApiRepositoryBundle } from "./apiRepositories";
import type { LocalRepository } from "./LocalRepository";
import { LocalReplica } from "./LocalReplica";

export type CloudRepositoryCallbacks = {
  onRemoteSuccess: (replicaAvailable: boolean) => void;
  onLocalFallback: (error: unknown) => void;
  onReplicaFailure: (error: unknown) => void;
  onMutation: () => void;
};

export class CloudRepository {
  readonly lists: ListRepository;
  readonly tasks: TaskRepository;
  readonly history: HistoryRepository;
  readonly sync: LocalRepository["sync"];

  private readonly replica: LocalReplica;
  private readonly callbacks: CloudRepositoryCallbacks;

  constructor(
    private readonly apiRepositories: ApiRepositoryBundle,
    private readonly localRepository: LocalRepository,
    options: { replica?: LocalReplica; callbacks: CloudRepositoryCallbacks },
  ) {
    this.replica = options.replica ?? new LocalReplica(localRepository.getDatabase());
    this.callbacks = options.callbacks;
    this.sync = localRepository.sync;
    this.lists = {
      findAll: () => this.findLists(),
      create: (input) => this.createList(input),
      update: (id, input) => this.updateList(id, input),
      delete: (id) => this.deleteList(id),
    };
    this.tasks = {
      findAll: () => this.findTasks(),
      create: (input) => this.createTask(input),
      update: (id, input) => this.updateTask(id, input),
      complete: (id) => this.completeTask(id),
      reopen: (id) => this.reopenTask(id),
      delete: (id) => this.deleteTask(id),
    };
    this.history = {
      findPage: (input) => this.findHistory(input),
    };
  }
  
  private async findLists(): Promise<TaskList[]> {
    return this.readWithFallback(
      () => this.apiRepositories.lists.findAll(),
      () => this.localRepository.lists.findAll(),
      (value) => this.replica.saveLists(value),
    );
  }

  private async findTasks(): Promise<Task[]> {
    return this.readWithFallback(
      () => this.apiRepositories.tasks.findAll(),
      () => this.localRepository.tasks.findAll(),
      (value) => this.replica.saveTasks(value),
    );
  }

  private async findHistory(input?: { listId?: string; page?: number; pageSize?: number }): Promise<HistoryPage> {
    return this.readWithFallback(
      () => this.apiRepositories.history.findPage(input),
      () => this.localRepository.history.findPage(input),
      (value) => this.replica.saveHistory(value.entries),
    );
  }

  private createList(input: ListDraft): Promise<TaskList> {
    return this.mutate(
      () => this.apiRepositories.lists.create(input),
      () => this.localRepository.lists.create(input),
      (value) => this.replica.saveLists([value]),
    );
  }

  private updateList(id: string, input: ListPatch): Promise<TaskList> {
    return this.mutate(
      () => this.apiRepositories.lists.update(id, input),
      () => this.localRepository.lists.update(id, input),
      (value) => this.replica.saveLists([value]),
    );
  }

  private deleteList(id: string): Promise<void> {
    return this.mutate(
      () => this.apiRepositories.lists.delete(id),
      () => this.localRepository.lists.delete(id),
      () => this.replica.markListDeleted(id),
    );
  }

  private createTask(input: TaskDraft): Promise<Task> {
    return this.mutate(
      () => this.apiRepositories.tasks.create(input),
      () => this.localRepository.tasks.create(input),
      (value) => this.replica.saveTasks([value]),
    );
  }

  private updateTask(id: string, input: TaskPatch): Promise<Task> {
    return this.mutate(
      () => this.apiRepositories.tasks.update(id, input),
      () => this.localRepository.tasks.update(id, input),
      (value) => this.replica.saveTasks([value]),
    );
  }

  private completeTask(id: string): Promise<Task> {
    return this.mutate(
      () => this.apiRepositories.tasks.complete(id),
      () => this.localRepository.tasks.complete(id),
      (value) => this.replica.saveTasks([value]),
    );
  }

  private reopenTask(id: string): Promise<Task> {
    return this.mutate(
      () => this.apiRepositories.tasks.reopen(id),
      () => this.localRepository.tasks.reopen(id),
      (value) => this.replica.saveTasks([value]),
    );
  }

  private deleteTask(id: string): Promise<void> {
    return this.mutate(
      () => this.apiRepositories.tasks.delete(id),
      () => this.localRepository.tasks.delete(id),
      () => this.replica.markTaskDeleted(id),
    );
  }

  private async readWithFallback<Result>(
    remote: () => Promise<Result>,
    local: () => Promise<Result>,
    cache: (value: Result) => Promise<void>,
  ): Promise<Result> {
    try {
      const result = await remote();
      const replicaAvailable = await this.cacheWithoutChangingResult(cache, result);
      this.callbacks.onRemoteSuccess(replicaAvailable);
      return result;
    } catch (error) {
      if (!isCloudUnavailable(error)) {
        throw error;
      }
      const result = await local();
      this.callbacks.onLocalFallback(error);
      this.callbacks.onMutation();
      return result;
    }
  }

  private async mutate<Result>(
    remote: () => Promise<Result>,
    local: () => Promise<Result>,
    cache: (value: Result) => Promise<void>,
  ): Promise<Result> {
    try {
      const result = await remote();
      const replicaAvailable = await this.cacheWithoutChangingResult(cache, result);
      this.callbacks.onRemoteSuccess(replicaAvailable);
      this.callbacks.onMutation();
      return result;
    } catch (error) {
      if (!isCloudUnavailable(error)) {
        throw error;
      }
      const result = await local();
      this.callbacks.onLocalFallback(error);
      this.callbacks.onMutation();
      return result;
    }
  }

  private async cacheWithoutChangingResult<Result>(cache: (value: Result) => Promise<void>, value: Result): Promise<boolean> {
    try {
      await cache(value);
      return true;
    } catch (error) {
      this.callbacks.onReplicaFailure(error);
      return false;
    }
  }
}

function isCloudUnavailable(error: unknown): boolean {
  if (error instanceof TaskFlowApiError) {
    return error.status === 0 || error.status === 408 || error.status >= 500;
  }
  return error instanceof TypeError;
}