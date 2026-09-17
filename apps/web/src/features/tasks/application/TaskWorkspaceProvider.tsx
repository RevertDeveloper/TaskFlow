"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import type { HistoryPage } from "@/domain/history/models";
import type { HistoryRepository } from "@/domain/history/ports";
import type { ListDraft, ListPatch, TaskList } from "@/domain/list/models";
import type { ListRepository } from "@/domain/list/ports";
import type { Task, TaskDraft, TaskPatch } from "@/domain/task/models";
import type { TaskRepository } from "@/domain/task/ports";
import { defaultStorageManager, type StorageManager } from "@/application/storage/StorageManager";
import type { StorageState } from "@/application/storage/StorageState";

export type WorkspaceRepositories = {
  lists: ListRepository;
  tasks: TaskRepository;
  history: HistoryRepository;
};

type TaskWorkspaceContextValue = {
  lists: TaskList[];
  tasks: Task[];
  historyPage: HistoryPage | null;
  storage: StorageState | null;
  loading: boolean;
  historyLoading: boolean;
  error: string | null;
  historyError: string | null;
  refresh: () => Promise<void>;
  loadHistory: (listId?: string | null, page?: number) => Promise<void>;
  createTask: (input: TaskDraft) => Promise<Task>;
  updateTask: (id: string, input: TaskPatch) => Promise<Task>;
  completeTask: (id: string) => Promise<Task>;
  reopenTask: (id: string) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  createList: (input: ListDraft) => Promise<TaskList>;
  updateList: (id: string, input: ListPatch) => Promise<TaskList>;
  deleteList: (id: string) => Promise<void>;
};

const TaskWorkspaceContext = createContext<TaskWorkspaceContextValue | null>(null);

export function TaskWorkspaceProvider({
  children,
  repositories,
  storageManager,
}: {
  children: ReactNode;
  repositories?: WorkspaceRepositories;
  storageManager?: StorageManager;
}) {
  const manager = storageManager ?? (repositories ? null : defaultStorageManager);
  const activeRepositories = manager?.repositories ?? repositories ?? defaultStorageManager.repositories;
  const [storage, setStorage] = useState<StorageState | null>(() => manager?.getSnapshot() ?? null);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [historyPage, setHistoryPage] = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!manager) {
      return undefined;
    }
    return manager.subscribe((nextState) => setStorage(nextState));
  }, [manager]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextLists, nextTasks] = await Promise.all([
        activeRepositories.lists.findAll(),
        activeRepositories.tasks.findAll(),
      ]);
      setLists(nextLists);
      setTasks(nextTasks);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
      void manager?.refreshState();
    }
  }, [activeRepositories, manager]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const loadHistory = useCallback(async (listId?: string | null, page = 1) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistoryPage(await activeRepositories.history.findPage({ listId: listId ?? undefined, page }));
    } catch (requestError) {
      setHistoryError(errorMessage(requestError));
    } finally {
      setHistoryLoading(false);
    }
  }, [activeRepositories]);

  const createTask = useCallback(async (input: TaskDraft) => {
    const optimisticTask: Task = {
      id: `optimistic-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      listId: input.listId,
      title: input.title.trim(),
      description: input.description ?? "",
      status: "pending",
      source: "manual",
      position: 0,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTasks((current) => [...current, optimisticTask]);
    try {
      const createdTask = await activeRepositories.tasks.create(input);
      setTasks((current) => current.map((task) => task.id === optimisticTask.id ? createdTask : task));
      return createdTask;
    } catch (requestError) {
      setTasks((current) => current.filter((task) => task.id !== optimisticTask.id));
      throw requestError;
    }
  }, [activeRepositories]);

  const updateTask = useCallback(async (id: string, input: TaskPatch) => {
    const previousTask = tasks.find((task) => task.id === id);
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...input } : task));
    try {
      const updatedTask = await activeRepositories.tasks.update(id, input);
      setTasks((current) => current.map((task) => task.id === id ? updatedTask : task));
      return updatedTask;
    } catch (requestError) {
      if (previousTask) {
        setTasks((current) => current.map((task) => task.id === id ? previousTask : task));
      }
      throw requestError;
    }
  }, [activeRepositories, tasks]);

  const completeTask = useCallback(async (id: string) => {
    return mutateTaskStatus(id, activeRepositories.tasks.complete, "completed", tasks, setTasks);
  }, [activeRepositories, tasks]);

  const reopenTask = useCallback(async (id: string) => {
    return mutateTaskStatus(id, activeRepositories.tasks.reopen, "pending", tasks, setTasks);
  }, [activeRepositories, tasks]);

  const deleteTask = useCallback(async (id: string) => {
    const previousTask = tasks.find((task) => task.id === id);
    setTasks((current) => current.filter((task) => task.id !== id));
    try {
      await activeRepositories.tasks.delete(id);
    } catch (requestError) {
      if (previousTask) {
        setTasks((current) => [...current, previousTask]);
      }
      throw requestError;
    }
  }, [activeRepositories, tasks]);

  const createList = useCallback(async (input: ListDraft) => {
    const createdList = await activeRepositories.lists.create(input);
    setLists((current) => [...current, createdList].sort((left, right) => left.position - right.position));
    return createdList;
  }, [activeRepositories]);

  const updateList = useCallback(async (id: string, input: ListPatch) => {
    const previousList = lists.find((list) => list.id === id);
    setLists((current) => current.map((list) => list.id === id ? { ...list, ...input } : list));
    try {
      const updatedList = await activeRepositories.lists.update(id, input);
      setLists((current) => current.map((list) => list.id === id ? updatedList : list));
      return updatedList;
    } catch (requestError) {
      if (previousList) {
        setLists((current) => current.map((list) => list.id === id ? previousList : list));
      }
      throw requestError;
    }
  }, [activeRepositories, lists]);

  const deleteList = useCallback(async (id: string) => {
    const previousList = lists.find((list) => list.id === id);
    setLists((current) => current.filter((list) => list.id !== id));
    try {
      await activeRepositories.lists.delete(id);
      const inbox = lists.find((list) => list.isSystem);
      if (inbox) {
        setTasks((current) => current.map((task) => task.listId === id ? { ...task, listId: inbox.id } : task));
      }
    } catch (requestError) {
      if (previousList) {
        setLists((current) => [...current, previousList].sort((left, right) => left.position - right.position));
      }
      throw requestError;
    }
  }, [activeRepositories, lists]);

  const value: TaskWorkspaceContextValue = {
    lists,
    tasks,
    historyPage,
    storage,
    loading,
    historyLoading,
    error,
    historyError,
    refresh,
    loadHistory,
    createTask,
    updateTask,
    completeTask,
    reopenTask,
    deleteTask,
    createList,
    updateList,
    deleteList,
  };

  return <TaskWorkspaceContext.Provider value={value}>{children}</TaskWorkspaceContext.Provider>;
}

export function useTaskWorkspace(): TaskWorkspaceContextValue {
  const context = useContext(TaskWorkspaceContext);
  if (!context) {
    throw new Error("useTaskWorkspace debe utilizarse dentro de TaskWorkspaceProvider.");
  }
  return context;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo completar la operación.";
}

async function mutateTaskStatus(
  id: string,
  operation: (taskId: string) => Promise<Task>,
  status: Task["status"],
  tasks: Task[],
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>,
): Promise<Task> {
  const previousTask = tasks.find((task) => task.id === id);
  setTasks((current) => current.map((task) => task.id === id ? { ...task, status, completedAt: status === "completed" ? new Date().toISOString() : null } : task));
  try {
    const updatedTask = await operation(id);
    setTasks((current) => current.map((task) => task.id === id ? updatedTask : task));
    return updatedTask;
  } catch (requestError) {
    if (previousTask) {
      setTasks((current) => current.map((task) => task.id === id ? previousTask : task));
    }
    throw requestError;
  }
}