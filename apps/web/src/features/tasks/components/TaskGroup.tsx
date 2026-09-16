import type { TaskList } from "@/domain/list/models";
import type { Task } from "@/domain/task/models";
import { TaskCard } from "./TaskCard";

type TaskGroupProps = {
  list: TaskList;
  tasks: Task[];
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
};

export function TaskGroup({ list, tasks, onComplete, onReopen, onEdit, onDelete }: TaskGroupProps) {
  return (
    <section className="task-group" aria-labelledby={`task-group-${list.id}`}>
      <div className="task-group__header">
        <div>
          <p className="task-group__eyebrow">{list.isSystem ? "Siempre disponible" : "Lista"}</p>
          <h2 id={`task-group-${list.id}`}><span aria-hidden="true">{list.emoji || "·"}</span> {list.name}</h2>
        </div>
        <span className="task-group__count">{tasks.length}</span>
      </div>
      <div className="task-group__items">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            listName={list.name}
            onComplete={onComplete}
            onReopen={onReopen}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}