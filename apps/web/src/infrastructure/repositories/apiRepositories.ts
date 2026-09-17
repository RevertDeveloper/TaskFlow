import type { HistoryRepository } from "@/domain/repositories/HistoryRepository";
import type { ListRepository } from "@/domain/repositories/ListRepository";
import type { TaskRepository } from "@/domain/repositories/TaskRepository";
import { ApiHistoryRepository } from "./ApiHistoryRepository";
import { ApiListRepository } from "./ApiListRepository";
import { ApiTaskRepository } from "./ApiTaskRepository";

export type ApiRepositoryBundle = {
  lists: ListRepository;
  tasks: TaskRepository;
  history: HistoryRepository;
};

export const taskFlowApiRepositories: ApiRepositoryBundle = {
  lists: new ApiListRepository(),
  tasks: new ApiTaskRepository(),
  history: new ApiHistoryRepository(),
};