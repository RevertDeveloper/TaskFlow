"use client";

import { useRef, useState } from "react";

import { ListSwitcher } from "@/components/navigation/ListSwitcher";
import { CheckCircle2, ListFilter, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Toast } from "@/components/ui/Toast";
import { useTaskWorkspace } from "@/features/tasks/application/TaskWorkspaceProvider";
import { PendingCount } from "@/features/tasks/components/PendingCount";
import { QuickTaskInput } from "@/features/tasks/components/QuickTaskInput";
import { TaskBoard } from "@/features/tasks/components/TaskBoard";
import { TaskEditor } from "@/features/tasks/components/TaskEditor";
import type { Task } from "@/domain/task/models";
import { useUiStore } from "@/stores/uiStore";
import { accountsLoginUrl } from "@/infrastructure/accounts/client";
import { useAuth } from "@/features/auth/components/AuthBoundary";
import type { VoiceReviewTask, VoiceReviewDraft, VoiceSessionOutput } from "@/infrastructure/api/generated/types";
import { api } from "@/infrastructure/api/httpClient";
import { VoiceRecorder } from "@/features/voice/components/VoiceRecorder";
import { VoiceReview } from "@/features/voice/components/VoiceReview";

export function DashboardView() {
  const { lists, tasks, loading, error, refresh, createTask, updateTask, completeTask, reopenTask, deleteTask } = useTaskWorkspace();
  const { state } = useAuth();
  const activeListId = useUiStore((state) => state.activeListId);
  const setActiveListId = useUiStore((state) => state.setActiveListId);
  const editingTaskId = useUiStore((state) => state.editingTaskId);
  const setEditingTaskId = useUiStore((state) => state.setEditingTaskId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [voiceSession, setVoiceSession] = useState<VoiceSessionOutput | null>(null);
  const [voiceDraft, setVoiceDraft] = useState<VoiceReviewDraft | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceConfirmationKey = useRef<string | null>(null);

  const inbox = lists.find((list) => list.isSystem) ?? lists[0];
  const activeList = lists.find((list) => list.id === activeListId);
  const pendingCount = tasks.filter((task) => task.status === "pending" && (!activeListId || task.listId === activeListId)).length;
  const listOptions = [
    { id: "all", name: "Todas", emoji: "✦" },
    ...lists.filter((list) => !list.isArchived).map((list) => ({ id: list.id, name: list.name, emoji: list.emoji || "·" })),
  ];
  const selectedListId = activeListId ?? "all";
  const editingTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) ?? null : null;
  const canUseVoice = state.status === "authenticated";

  function openNewTask() {
    setEditingTaskId(null);
    setEditorOpen(true);
  }

  function openEditor(task: Task) {
    setEditingTaskId(task.id);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingTaskId(null);
  }

  function selectList(id: string) {
    setActiveListId(id === "all" ? null : id);
  }

  async function runAction(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "No se pudo completar la acción.");
    }
  }

  async function handleAudioReady(audio: Blob, fileName: string) {
    setVoiceLoading(true);
    setVoiceError(null);
    try {
      const upload = await api.uploadVoiceSession(audio, fileName);
      setVoiceSession(upload.data);
      const review = await pollVoiceReview(upload.data.id, activeListId, setVoiceSession);
      setVoiceDraft(review);
    } catch (requestError) {
      setVoiceError(requestError instanceof Error ? requestError.message : "No se pudo preparar la revisión de voz.");
    } finally {
      setVoiceLoading(false);
    }
  }

  async function handleVoiceConfirm(tasks: Array<Pick<VoiceReviewTask, "title" | "description" | "list_id">>) {
    if (!voiceDraft) {
      return;
    }
    setVoiceSaving(true);
    setVoiceError(null);
    try {
      voiceConfirmationKey.current ??= globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
      await api.confirmVoiceReview(voiceDraft.id, {
        idempotency_key: voiceConfirmationKey.current,
        tasks,
      });
      await refresh();
      setVoiceDraft(null);
      setVoiceSession(null);
      voiceConfirmationKey.current = null;
    } catch (requestError) {
      setVoiceError(requestError instanceof Error ? requestError.message : "No se pudieron crear las tareas.");
    } finally {
      setVoiceSaving(false);
    }
  }

  return (
    <section className="page-section dashboard-page" aria-labelledby="dashboard-title">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Espacio personal / Hoy</p>
          <h1 id="dashboard-title">Pendientes que caben en la cabeza.</h1>
          <p className="page-lede">Captura lo importante y vuelve a lo que tienes entre manos.</p>
        </div>
        <PendingCount count={pendingCount} />
      </header>

      <QuickTaskInput defaultListId={activeListId ?? inbox?.id ?? null} onCreate={createTask} />

      {canUseVoice ? (
        <VoiceRecorder onAudioReady={(audio, fileName) => void handleAudioReady(audio, fileName)} disabled={voiceLoading} />
      ) : (
        <div className="voice-recorder voice-recorder--locked">
          <div>
            <p className="empty-panel__label">Captura por voz</p>
            <p>Inicia sesión para convertir una grabación en tareas con IA.</p>
          </div>
          <a className="ui-button ui-button--secondary" href={accountsLoginUrl(currentPath())}>Iniciar sesión</a>
        </div>
      )}
      {voiceLoading && voiceSession ? (
        <div className="voice-processing" role="status" aria-live="polite">
          <span className="ui-spinner" aria-hidden="true" />
          <span>{voiceSession.status === "transcribing" ? "Transcribiendo tu captura..." : "Preparando la revisión..."}</span>
        </div>
      ) : null}
      {voiceError ? <Toast tone="error" message={voiceError} onDismiss={() => setVoiceError(null)} /> : null}

      <div className="dashboard-toolbar">
        <div className="dashboard-toolbar__label">
          <ListFilter size={16} aria-hidden="true" />
          <span>{activeList ? activeList.name : "Todas las listas"}</span>
        </div>
        <div className="dashboard-toolbar__actions">
          <Button variant="secondary" onClick={openNewTask} disabled={!inbox}>
            <CheckCircle2 size={16} aria-hidden="true" />
            Detallar tarea
          </Button>
          <Button variant="ghost" onClick={() => void refresh()} loading={loading}>
            <RefreshCw size={16} aria-hidden="true" />
            Actualizar
          </Button>
        </div>
      </div>

      <ListSwitcher lists={listOptions} activeListId={selectedListId} onChange={selectList} />

      {error ? (
        <div className="workspace-error" role="alert">
          <div>
            <p className="eyebrow">No se pudo cargar el espacio</p>
            <p>{error}</p>
          </div>
          <Button variant="secondary" onClick={() => void refresh()}>Reintentar</Button>
        </div>
      ) : loading ? (
        <div className="task-board__loading" role="status" aria-live="polite">
          <span className="ui-spinner" aria-hidden="true" /> Cargando tus tareas...
        </div>
      ) : (
        <TaskBoard
          lists={lists}
          tasks={tasks}
          activeListId={activeListId}
          onComplete={(id) => void runAction(() => completeTask(id))}
          onReopen={(id) => void runAction(() => reopenTask(id))}
          onEdit={openEditor}
          onDelete={setDeletingTask}
        />
      )}

      {actionError ? <Toast tone="error" message={actionError} onDismiss={() => setActionError(null)} /> : null}

      {editorOpen ? (
        <TaskEditor
          key={editingTask?.id ?? "new-task"}
          open
          task={editingTask}
          lists={lists}
          defaultListId={activeListId ?? inbox?.id ?? null}
          onClose={closeEditor}
          onCreate={createTask}
          onUpdate={updateTask}
        />
      ) : null}

      {voiceDraft ? (
        <VoiceReview
          open
          draft={voiceDraft}
          lists={lists}
          saving={voiceSaving}
          onClose={() => setVoiceDraft(null)}
          onConfirm={handleVoiceConfirm}
        />
      ) : null}

      <Modal open={Boolean(deletingTask)} title="Eliminar tarea" onClose={() => setDeletingTask(null)}>
        <div className="confirm-dialog">
          <div className="confirm-dialog__icon" aria-hidden="true"><Trash2 size={20} /></div>
          <p>Se quitará <strong>{deletingTask?.title}</strong> de tus pendientes. El historial conservará el evento.</p>
          <div className="editor-form__actions">
            <Button variant="ghost" onClick={() => setDeletingTask(null)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deletingTask) {
                  void runAction(() => deleteTask(deletingTask.id));
                }
                setDeletingTask(null);
              }}
            >
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

async function pollVoiceReview(
  sessionId: string,
  currentListId: string | null,
  setSession: (session: VoiceSessionOutput) => void,
): Promise<VoiceReviewDraft> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await api.voiceSession(sessionId);
    setSession(response.data);
    if (response.data.status === "transcribed") {
      return (await api.createVoiceReview(sessionId, currentListId)).data;
    }
    if (response.data.status === "failed") {
      throw new Error("La transcripción no se pudo completar.");
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 800));
  }
  throw new Error("La transcripción está tardando más de lo esperado.");
}