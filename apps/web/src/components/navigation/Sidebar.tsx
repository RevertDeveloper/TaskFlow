"use client";

import { Cloud, HardDrive, History, LayoutDashboard, ListTodo, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeSwitcher } from "./ThemeSwitcher";
import { useTaskWorkspace } from "@/features/tasks/application/TaskWorkspaceProvider";

const navigationItems = [
  { href: "/app/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/app/lists", label: "Listas", icon: ListTodo },
  { href: "/app/history", label: "Historial", icon: History },
  { href: "/app/settings", label: "Ajustes", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { storage } = useTaskWorkspace();

  return (
    <aside className="app-frame__sidebar" aria-label="Navegación principal">
      <Link className="brand-mark" href="/app/dashboard" aria-label="TaskFlow, ir al panel">
        <span className="brand-mark__dot" aria-hidden="true" />
        <span>TaskFlow</span>
      </Link>
      <nav className="app-nav">
        {navigationItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} aria-current={isActive ? "page" : undefined}>
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="app-frame__sidebar-footer">
        {storage ? <StorageIndicator storage={storage} /> : null}
        <p className="sidebar-note">Un lugar para lo que importa.</p>
        <ThemeSwitcher />
      </div>
    </aside>
  );
}

function StorageIndicator({ storage }: { storage: NonNullable<ReturnType<typeof useTaskWorkspace>["storage"]> }) {
  const Icon = storage.mode === "cloud" ? Cloud : HardDrive;
  const label = storage.availability === "loading"
    ? "Preparando almacenamiento"
    : storage.availability === "unavailable"
      ? "Almacenamiento no disponible"
      : storage.mode === "device"
        ? "Solo dispositivo"
        : storage.syncStatus === "syncing"
          ? "Sincronizando"
          : storage.syncStatus === "paused"
            ? "Sin conexion"
            : storage.syncStatus === "error"
              ? "Error de sincronizacion"
              : storage.pendingOperations > 0
                ? "Pendiente"
                : storage.source === "remote" && !storage.isStale
                  ? "Sincronizado"
                  : "Cloud"
  const detail = storage.availability === "loading"
    ? "Comprobando autoridad"
    : storage.availability === "unavailable"
      ? "Revisa el estado de la aplicación"
      : storage.mode === "device"
        ? "Datos locales · sync desactivado"
        : storage.syncStatus === "syncing"
          ? "Comprobando cambios remotos"
          : storage.syncStatus === "paused"
            ? "Los cambios quedan en la replica local"
            : storage.syncStatus === "error"
              ? storage.error ?? "Revisa la conexion y vuelve a intentarlo"
              : storage.pendingOperations > 0
                ? `${storage.pendingOperations} operaciones pendientes`
        : storage.source === "local"
          ? `Réplica local · ${storage.pendingOperations} pendientes`
          : storage.pendingOperations > 0
            ? `${storage.pendingOperations} operaciones pendientes`
            : "Autoridad remota · al día";
  const isWarning = storage.isStale || storage.availability === "unavailable" || storage.syncStatus === "error";

  return (
    <div className={`storage-indicator${isWarning ? " storage-indicator--warning" : ""}`} role="status" aria-live="polite">
      <Icon size={16} aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}