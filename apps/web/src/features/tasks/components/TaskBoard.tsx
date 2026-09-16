import type { TaskList } from "@/domain/list/models";
import type { Task } from "@/domain/task/models";
import { TaskGroup } from "./TaskGroup";

type TaskBoardProps = {
  lists: TaskList[];
  tasks: Task[];
  activeListId: string | null;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
};

export function TaskBoard({ lists, tasks, activeListId, onComplete, onReopen, onEdit, onDelete }: TaskBoardProps) {
  const pendingTasks = tasks.filter((task) => task.status === "pending");
  const visibleLists = lists.filter((list) => !list.isArchived && (!activeListId || list.id === activeListId));
  const groups = visibleLists
    .map((list) => ({ list, tasks: pendingTasks.filter((task) => task.listId === list.id) }))
    .filter(({ tasks: groupTasks }) => groupTasks.length > 0);

  if (groups.length === 0) {
    return (
      <div className="task-board__empty" role="status">
        <span className="task-board__empty-mark" aria-hidden="true">✓</span>
        <h2>{activeListId ? "Esta lista está despejada." : "Todo está despejado."}</h2>
        <p>Captura la siguiente cosa importante arriba. El historial conserva lo que ya terminaste.</p>
      </div>
    );
  }

  return (
    <div className="task-board">
      {groups.map(({ list, tasks: groupTasks }) => (
        <TaskGroup
          key={list.id}
          list={list}
          tasks={groupTasks}
          onComplete={onComplete}
          onReopen={onReopen}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}