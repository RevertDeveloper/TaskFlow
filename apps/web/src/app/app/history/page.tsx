"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { HistoryTimeline } from "@/features/history/components/HistoryTimeline";
import { useTaskWorkspace } from "@/features/tasks/application/TaskWorkspaceProvider";
import { useUiStore } from "@/stores/uiStore";

export default function HistoryPage() {
  const { lists, tasks, historyPage, historyLoading, historyError, loadHistory, reopenTask } = useTaskWorkspace();
  const historyListId = useUiStore((state) => state.historyListId);
  const setHistoryListId = useUiStore((state) => state.setHistoryListId);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void loadHistory(historyListId);
  }, [historyListId, loadHistory]);

  async function handleReopen(taskId: string) {
    setActionError(null);
    try {
      await reopenTask(taskId);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "No se pudo reabrir la tarea.");
    }
  }

  return (
    <section className="page-section history-page" aria-labelledby="history-title">
      <header className="history-header">
        <div>
          <p className="eyebrow">Registro de actividad</p>
          <h1 id="history-title">Lo que ya está hecho.</h1>
          <p className="page-lede">Las tareas completadas no desaparecen: dejan espacio y contexto.</p>
        </div>
        <div className="history-filter">
          <label htmlFor="history-list-filter">Ver actividad de</label>
          <select id="history-list-filter" className="ui-input" value={historyListId ?? "all"} onChange={(event) => setHistoryListId(event.target.value === "all" ? null : event.target.value)}>
            <option value="all">Todas las listas</option>
            {lists.filter((list) => !list.isArchived).map((list) => <option key={list.id} value={list.id}>{list.emoji || "·"} {list.name}</option>)}
          </select>
        </div>
      </header>

      {historyError ? <div className="workspace-error" role="alert"><p>{historyError}</p><Button variant="secondary" onClick={() => void loadHistory(historyListId)}>Reintentar</Button></div> : null}
      <HistoryTimeline page={historyPage} tasks={tasks} loading={historyLoading} onPageChange={(page) => void loadHistory(historyListId, page)} onReopen={(taskId) => void handleReopen(taskId)} />
      {actionError ? <Toast tone="error" message={actionError} onDismiss={() => setActionError(null)} /> : null}
    </section>
  );
}