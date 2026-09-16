"use client";

import { Archive, ArchiveRestore, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import type { ListDraft, ListPatch, TaskList } from "@/domain/list/models";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Toast } from "@/components/ui/Toast";
import { ListEditor } from "./ListEditor";

type ListManagerProps = {
  lists: TaskList[];
  loading: boolean;
  error: string | null;
  onCreate: (input: ListDraft) => Promise<unknown>;
  onUpdate: (id: string, input: ListPatch) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
};

export function ListManager({ lists, loading, error, onCreate, onUpdate, onDelete }: ListManagerProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingList, setEditingList] = useState<TaskList | null>(null);
  const [deletingList, setDeletingList] = useState<TaskList | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function openNewList() {
    setEditingList(null);
    setEditorOpen(true);
  }

  function openEditor(list: TaskList) {
    setEditingList(list);
    setEditorOpen(true);
  }

  async function runAction(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "No se pudo completar la acción.");
    }
  }

  return (
    <>
      <div className="lists-header">
        <div>
          <p className="eyebrow">Organización</p>
          <h1 id="lists-title">Listas que te dan contexto.</h1>
          <p className="page-lede">Separa proyectos y ritmos sin perder una bandeja de entrada rápida.</p>
        </div>
        <Button onClick={openNewList}>
          <FolderPlus size={17} aria-hidden="true" />
          Nueva lista
        </Button>
      </div>

      {error ? <div className="workspace-error" role="alert"><p>{error}</p></div> : null}
      {loading ? (
        <div className="task-board__loading" role="status"><span className="ui-spinner" aria-hidden="true" /> Cargando listas...</div>
      ) : (
        <div className="list-grid">
          {lists.map((list) => (
            <article className={`list-card${list.isArchived ? " list-card--archived" : ""}`} key={list.id}>
              <div className="list-card__topline">
                <span className="list-card__emoji" aria-hidden="true">{list.emoji || "·"}</span>
                <div className="list-card__badges">
                  {list.isSystem ? <span className="status-chip">Permanente</span> : null}
                  {list.isArchived ? <span className="status-chip status-chip--muted">Archivada</span> : null}
                </div>
              </div>
              <h2>{list.name}</h2>
              <p>{list.description || "Sin descripción. Añade una pista para reconocerla más rápido."}</p>
              <div className="list-card__actions">
                <Button variant="secondary" onClick={() => openEditor(list)}>
                  <Pencil size={15} aria-hidden="true" /> Editar
                </Button>
                {!list.isSystem ? (
                  <>
                    <Button variant="ghost" onClick={() => void runAction(() => onUpdate(list.id, { isArchived: !list.isArchived }))}>
                      {list.isArchived ? <ArchiveRestore size={15} aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}
                      {list.isArchived ? "Restaurar" : "Archivar"}
                    </Button>
                    <Button variant="ghost" onClick={() => setDeletingList(list)} aria-label={`Eliminar ${list.name}`}>
                      <Trash2 size={15} aria-hidden="true" />
                    </Button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && lists.length === 0 ? (
        <div className="empty-panel"><p className="empty-panel__label">Sin listas</p><h2>Tu Inbox aparecerá al actualizar.</h2></div>
      ) : null}

      {actionError ? <Toast tone="error" message={actionError} onDismiss={() => setActionError(null)} /> : null}

      {editorOpen ? (
        <ListEditor
          key={editingList?.id ?? "new-list"}
          open
          list={editingList}
          onClose={() => setEditorOpen(false)}
          onCreate={onCreate}
          onUpdate={onUpdate}
        />
      ) : null}

      <Modal open={Boolean(deletingList)} title="Eliminar lista" onClose={() => setDeletingList(null)}>
        <div className="confirm-dialog">
          <div className="confirm-dialog__icon" aria-hidden="true"><Trash2 size={20} /></div>
          <p>Las tareas de <strong>{deletingList?.name}</strong> pasarán a Inbox. No se eliminarán.</p>
          <div className="editor-form__actions">
            <Button variant="ghost" onClick={() => setDeletingList(null)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deletingList) {
                  void runAction(() => onDelete(deletingList.id));
                }
                setDeletingList(null);
              }}
            >
              Eliminar lista
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}