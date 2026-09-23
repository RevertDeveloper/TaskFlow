"use client";

import { ArrowLeft, Cloud, HardDrive, LogOut, RefreshCw, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useState } from "react";

import { AccountControl } from "@/components/navigation/AccountControl";
import { ThemeSwitcher } from "@/components/navigation/ThemeSwitcher";
import { useTaskWorkspace } from "@/features/tasks/application/TaskWorkspaceProvider";
import { useAuth } from "@/features/auth/components/AuthBoundary";
import type { StorageMode } from "@/application/storage/StorageMode";

type ProfileSettingsProps = { onBack: () => void };
type BusyAction = "mode" | "sync" | "local-reset" | "cloud-reset" | "logout" | null;

export function ProfileSettings({ onBack }: ProfileSettingsProps) {
  const { storage, refresh, storageManager } = useTaskWorkspace();
  const { state, user, logout } = useAuth();
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentMode = storage?.mode ?? "device";
  const isAuthenticated = state.status === "authenticated" || state.status === "email-pending";
  const displayName = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username : "Visitante";

  function clearMessages(): void {
    setFeedback(null);
    setError(null);
  }

  async function changeMode(mode: StorageMode): Promise<void> {
    if (mode === currentMode) return;
    setBusyAction("mode");
    clearMessages();
    try {
      if (!storageManager) throw new Error("El almacenamiento no está disponible.");
      await storageManager.setMode(mode);
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
    clearMessages();
    try {
      if (!storageManager) throw new Error("El almacenamiento no está disponible.");
      const result = await storageManager.syncNow();
      await refresh();
      setFeedback(result.status === "error" ? "La sincronización necesita atención." : "Sincronización completada.");
      if (result.error) setError(result.error);
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  }

  async function resetLocal(): Promise<void> {
    if (!window.confirm("Se eliminarán los datos guardados en este dispositivo. ¿Continuar?")) return;
    setBusyAction("local-reset");
    clearMessages();
    try {
      if (!storageManager) throw new Error("El almacenamiento no está disponible.");
      await storageManager.resetLocal();
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
    if (confirmation === null) return;
    setBusyAction("cloud-reset");
    clearMessages();
    try {
      if (!storageManager) throw new Error("El almacenamiento no está disponible.");
      await storageManager.resetCloud(confirmation);
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
    clearMessages();
    try {
      await logout();
      setFeedback("Sesión cerrada.");
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  }

  const isBusy = busyAction !== null;
  return (
    <section className="notes-profile" aria-labelledby="profile-title">
      <header className="notes-profile__header">
        <button className="icon-button" type="button" aria-label="Volver a la biblioteca" onClick={onBack}>
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div>
          <span className="section-kicker">Espacio personal</span>
          <h2 id="profile-title">Mi perfil</h2>
        </div>
      </header>

      <div className="notes-profile__content">
        <section className="profile-card profile-card--identity" aria-labelledby="profile-identity-title">
          <div className="profile-card__icon"><UserRound size={22} aria-hidden="true" /></div>
          <div className="profile-card__body">
            <span className="section-kicker">Cuenta</span>
            <h3 id="profile-identity-title">{displayName}</h3>
            <p>{user?.email ?? "Trabajando en este dispositivo"}</p>
            <AccountControl />
          </div>
        </section>

        <section className="profile-card" aria-labelledby="profile-theme-title">
          <div className="profile-card__heading">
            <div>
              <span className="section-kicker">Apariencia</span>
              <h3 id="profile-theme-title">Tema de TaskFlow</h3>
            </div>
            <ShieldCheck size={22} aria-hidden="true" />
          </div>
          <p>Elige el ambiente visual para tu espacio de notas.</p>
          <ThemeSwitcher />
        </section>

        <section className="profile-card" aria-labelledby="profile-storage-title">
          <div className="profile-card__heading">
            <div>
              <span className="section-kicker">Persistencia</span>
              <h3 id="profile-storage-title">Dónde viven tus datos</h3>
            </div>
            {currentMode === "cloud" ? <Cloud size={22} aria-hidden="true" /> : <HardDrive size={22} aria-hidden="true" />}
          </div>
          <p>Cloud sincroniza tus espacios. Device mantiene una copia local sin depender de la red.</p>
          <div className="profile-storage-options" role="group" aria-label="Modo de almacenamiento">
            <button className={`profile-storage-option${currentMode === "cloud" ? " profile-storage-option--active" : ""}`} type="button" disabled={isBusy} onClick={() => void changeMode("cloud")}>
              <Cloud size={18} aria-hidden="true" /><span><strong>Cloud</strong><small>Sincronizado</small></span>
            </button>
            <button className={`profile-storage-option${currentMode === "device" ? " profile-storage-option--active" : ""}`} type="button" disabled={isBusy} onClick={() => void changeMode("device")}>
              <HardDrive size={18} aria-hidden="true" /><span><strong>Device</strong><small>Solo local</small></span>
            </button>
          </div>
          <dl className="settings-facts">
            <div><dt>Fuente actual</dt><dd>{storage?.source ?? "desconocida"}</dd></div>
            <div><dt>Operaciones pendientes</dt><dd>{storage?.pendingOperations ?? 0}</dd></div>
            <div><dt>Estado</dt><dd>{storage?.syncStatus ?? "cargando"}</dd></div>
          </dl>
          <button className="ui-button ui-button--secondary" type="button" disabled={isBusy || currentMode === "device"} onClick={() => void syncNow()}>
            <RefreshCw size={16} aria-hidden="true" /> Sincronizar ahora
          </button>
        </section>

        <section className="profile-card profile-card--danger" aria-labelledby="profile-data-title">
          <div className="profile-card__heading">
            <div>
              <span className="section-kicker">Recuperación</span>
              <h3 id="profile-data-title">Datos y sesión</h3>
            </div>
            <Trash2 size={22} aria-hidden="true" />
          </div>
          <p>Estas acciones son destructivas y requieren confirmación explícita.</p>
          <div className="profile-card__actions">
            <button className="ui-button ui-button--secondary" type="button" disabled={isBusy} onClick={() => void resetLocal()}><Trash2 size={16} aria-hidden="true" /> Borrar datos locales</button>
            {currentMode === "cloud" && state.status === "authenticated" ? <button className="ui-button ui-button--danger" type="button" disabled={isBusy} onClick={() => void resetCloud()}><Trash2 size={16} aria-hidden="true" /> Borrar datos Cloud</button> : null}
            {isAuthenticated ? <button className="ui-button ui-button--secondary" type="button" disabled={isBusy} onClick={() => void signOut()}><LogOut size={16} aria-hidden="true" /> Cerrar sesión</button> : null}
          </div>
        </section>

        {(feedback || error) ? <p className={error ? "settings-status settings-status--error" : "settings-status"} role={error ? "alert" : "status"}>{error ?? feedback}</p> : null}
      </div>
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo completar la operación.";
}