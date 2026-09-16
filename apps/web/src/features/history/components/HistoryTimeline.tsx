"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

import type { HistoryPage } from "@/domain/history/models";
import type { Task } from "@/domain/task/models";
import { Button } from "@/components/ui/Button";

type HistoryTimelineProps = {
  page: HistoryPage | null;
  tasks: Task[];
  loading: boolean;
  onPageChange: (page: number) => void;
  onReopen: (taskId: string) => void;
};

export function HistoryTimeline({ page, tasks, loading, onPageChange, onReopen }: HistoryTimelineProps) {
  const taskTitles = new Map(tasks.map((task) => [task.id, task.title]));

  if (loading && !page) {
    return <div className="task-board__loading" role="status"><span className="ui-spinner" aria-hidden="true" /> Cargando historial...</div>;
  }

  if (!page || page.entries.length === 0) {
    return (
      <div className="task-board__empty history-empty" role="status">
        <span className="task-board__empty-mark" aria-hidden="true">○</span>
        <h2>Aún no hay actividad.</h2>
        <p>Cuando completes una tarea, su recorrido quedará registrado aquí.</p>
      </div>
    );
  }

  return (
    <>
      <ol className="history-timeline">
        {page.entries.map((entry) => (
          <li className="history-entry" key={entry.id}>
            <span className="history-entry__marker" aria-hidden="true" />
            <div className="history-entry__body">
              <div className="history-entry__header">
                <p>{eventLabel(entry.eventType)}</p>
                <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
              </div>
              <h2>{entry.taskId ? taskTitles.get(entry.taskId) ?? "Tarea archivada" : "Actividad de lista"}</h2>
              {entry.eventType === "TASK_COMPLETED" && entry.taskId ? (
                <Button variant="ghost" onClick={() => onReopen(entry.taskId!)}>
                  <RotateCcw size={15} aria-hidden="true" /> Reabrir tarea
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <div className="history-pagination" aria-label="Paginación del historial">
        <span>Página {page.page} de {page.totalPages}</span>
        <div>
          <Button variant="secondary" onClick={() => onPageChange(page.page - 1)} disabled={page.page <= 1} aria-label="Página anterior">
            <ChevronLeft size={17} aria-hidden="true" />
          </Button>
          <Button variant="secondary" onClick={() => onPageChange(page.page + 1)} disabled={page.page >= page.totalPages} aria-label="Página siguiente">
            <ChevronRight size={17} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </>
  );
}

function eventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    TASK_CREATED: "Tarea creada",
    TASK_UPDATED: "Tarea actualizada",
    TASK_COMPLETED: "Tarea completada",
    TASK_REOPENED: "Tarea reabierta",
    TASK_MOVED: "Tarea movida",
    TASK_DELETED: "Tarea eliminada",
    LIST_CREATED: "Lista creada",
    LIST_UPDATED: "Lista actualizada",
    LIST_ARCHIVED: "Lista archivada",
    LIST_DELETED: "Lista eliminada",
  };
  return labels[eventType] ?? "Actividad registrada";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}