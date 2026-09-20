"use client";

import { Cloud, HardDrive, LogOut, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { defaultStorageManager } from "@/application/storage/StorageManager";
import type { StorageMode } from "@/application/storage/StorageMode";
import { useTaskWorkspace } from "@/features/tasks/application/TaskWorkspaceProvider";
import { logout } from "@/infrastructure/accounts/client";

type BusyAction = "mode" | "sync" | "local-reset" | "cloud-reset" | "logout" | null;

export default function SettingsPage() {
  const router = useRouter();
  const { storage, refresh } = useTaskWorkspace();
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentMode = storage?.mode ?? "cloud";

  async function changeMode(mode: StorageMode): Promise<void> {
    if (mode === currentMode) {
      return;
    }
    setBusyAction("mode");
    setFeedback(null);
    setError(null);
    try {
      await defaultStorageManager.setMode(mode);
      await refresh();
      setFeedback(`Modo ${mode === "cloud" ? "Cloud" : "Device"} activado.`);
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  }

  async function syncNow(): Promise<void> {
    setBusyAction("sync");
    setFeedback(null);
    setError(null);
    try {
      const result = await defaultStorageManager.syncNow();
      await refresh();
      setFeedback(result.status === "error" ? "La sincronización necesita atención." : "Sincronización completada.");
      if (result.error) {
        setError(result.error);
      }
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  }

  async function resetLocal(): Promise<void> {
    if (!window.confirm("Se eliminarán los datos guardados en este dispositivo. ¿Continuar?")) {
      return;
    }
    setBusyAction("local-reset");
    setFeedback(null);
    setError(null);
    try {
      await defaultStorageManager.resetLocal();
      await refresh();
      setFeedback("Los datos locales se han eliminado.");
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  }

  async function resetCloud(): Promise<void> {
    const confirmation = window.prompt("Escribe RESET TASKFLOW DATA para confirmar el borrado Cloud.");
    if (confirmation === null) {
      return;
    }
    setBusyAction("cloud-reset");
    setFeedback(null);
    setError(null);
    try {
      await defaultStorageManager.resetCloud(confirmation);
      await refresh();
      setFeedback("Los datos Cloud se han eliminado.");
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  }

  async function signOut(): Promise<void> {
    setBusyAction("logout");
    setFeedback(null);
    setError(null);
    try {
      await logout();
      router.replace("/login");
    } catch (actionError) {
      setBusyAction(null);
      setError(errorMessage(actionError));
    }
  }

  return (
    <section className="page-section settings-page" aria-labelledby="settings-title">
      <p className="eyebrow">Preferencias</p>
      <h1 id="settings-title">Ajustes</h1>
      <p className="page-lede">Controla dónde viven tus datos y cómo se recuperan cuando la conexión cambia.</p>

      <div className="settings-grid">
        <section className="settings-panel" aria-labelledby="storage-settings-title">
          <div className="settings-panel__heading">
            <div>
              <p className="empty-panel__label">Persistencia</p>
              <h2 id="storage-settings-title">Almacenamiento</h2>
            </div>
            {currentMode === "cloud" ? <Cloud aria-hidden="true" /> : <HardDrive aria-hidden="true" />}
          </div>
          <p>Cloud mantiene tus tareas sincronizadas. Device conserva una copia local sin depender de la red.</p>
          <div className="settings-mode" role="group" aria-label="Modo de almacenamiento">
            <button className={`ui-button ${currentMode === "cloud" ? "ui-button--primary" : "ui-button--secondary"}`} type="button" disabled={busyAction !== null} onClick={() => void changeMode("cloud")}>
              <Cloud size={16} aria-hidden="true" /> Cloud
            </button>
            <button className={`ui-button ${currentMode === "device" ? "ui-button--primary" : "ui-button--secondary"}`} type="button" disabled={busyAction !== null} onClick={() => void changeMode("device")}>
              <HardDrive size={16} aria-hidden="true" /> Device
            </button>
          </div>
          <dl className="settings-facts">
            <div><dt>Fuente actual</dt><dd>{storage?.source ?? "desconocida"}</dd></div>
            <div><dt>Operaciones pendientes</dt><dd>{storage?.pendingOperations ?? 0}</dd></div>
            <div><dt>Estado de sync</dt><dd>{storage?.syncStatus ?? "cargando"}</dd></div>
          </dl>
          <div className="settings-actions">
            <button className="ui-button ui-button--secondary" type="button" disabled={busyAction !== null || currentMode === "device"} onClick={() => void syncNow()}>
              <RefreshCw size={16} aria-hidden="true" /> Sincronizar ahora
            </button>
            <button className="ui-button ui-button--danger" type="button" disabled={busyAction !== null} onClick={() => void resetLocal()}>
              <Trash2 size={16} aria-hidden="true" /> Borrar datos locales
            </button>
          </div>
        </section>

        <section className="settings-panel" aria-labelledby="account-settings-title">
          <div className="settings-panel__heading">
            <div>
              <p className="empty-panel__label">Cuenta</p>
              <h2 id="account-settings-title">Sesión</h2>
            </div>
            <LogOut aria-hidden="true" />
          </div>
          <p>El cierre de sesión revoca la sesión global de Accounts en todos los espacios que la compartan.</p>
          <div className="settings-actions">
            <button className="ui-button ui-button--secondary" type="button" disabled={busyAction !== null} onClick={() => void signOut()}>
              <LogOut size={16} aria-hidden="true" /> Cerrar sesión
            </button>
            {currentMode === "cloud" && (
              <button className="ui-button ui-button--danger" type="button" disabled={busyAction !== null} onClick={() => void resetCloud()}>
                <Trash2 size={16} aria-hidden="true" /> Borrar Cloud
              </button>
            )}
          </div>
        </section>
      </div>

      {(feedback || error) && (
        <p className={error ? "settings-status settings-status--error" : "settings-status"} role={error ? "alert" : "status"}>
          {error ?? feedback}
        </p>
      )}
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo completar la operación.";
}