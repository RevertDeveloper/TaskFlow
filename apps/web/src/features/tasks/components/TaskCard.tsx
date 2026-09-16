"use client";

import { Check, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Task } from "@/domain/task/models";
import { IconButton } from "@/components/ui/IconButton";
import { Tooltip } from "@/components/ui/Tooltip";

type TaskCardProps = {
  task: Task;
  listName: string;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
};

export function TaskCard({ task, listName, onComplete, onReopen, onEdit, onDelete }: TaskCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isCompleted = task.status === "completed";

  function handleStatusChange() {
    if (isCompleted) {
      onReopen(task.id);
    } else {
      onComplete(task.id);
    }
    setMenuOpen(false);
  }

  return (
    <article className={`task-card${isCompleted ? " task-card--completed" : ""}`}>
      <button
        className="task-card__check"
        type="button"
        onClick={() => isCompleted ? onReopen(task.id) : onComplete(task.id)}
        aria-label={isCompleted ? `Reabrir ${task.title}` : `Completar ${task.title}`}
      >
        {isCompleted ? <RotateCcw size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
      </button>
      <button className="task-card__content" type="button" onDoubleClick={() => onEdit(task)} onClick={() => onEdit(task)}>
        <span className="task-card__title">{task.title}</span>
        {task.description ? <span className="task-card__description">{task.description}</span> : null}
        <span className="task-card__meta">{listName}</span>
      </button>
      <div className="task-card__actions">
        <Tooltip label="Más acciones">
          <IconButton icon={<MoreHorizontal size={18} aria-hidden="true" />} label={`Acciones para ${task.title}`} onClick={() => setMenuOpen((current) => !current)} aria-expanded={menuOpen} />
        </Tooltip>
        {menuOpen ? (
          <div className="task-card__menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { onEdit(task); setMenuOpen(false); }}>
              <Pencil size={15} aria-hidden="true" /> Editar
            </button>
            <button type="button" role="menuitem" onClick={handleStatusChange}>
              {isCompleted ? <RotateCcw size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
              {isCompleted ? "Reabrir" : "Completar"}
            </button>
            <button className="task-card__menu-danger" type="button" role="menuitem" onClick={() => { onDelete(task); setMenuOpen(false); }}>
              <Trash2 size={15} aria-hidden="true" /> Eliminar
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}