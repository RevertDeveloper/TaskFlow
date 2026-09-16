"use client";

import type { ReactNode } from "react";

import { MobileNav } from "@/components/navigation/MobileNav";
import { Sidebar } from "@/components/navigation/Sidebar";
import { AuthBoundary } from "@/features/auth/components/AuthBoundary";
import { TaskWorkspaceProvider } from "@/features/tasks/application/TaskWorkspaceProvider";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <AuthBoundary
      anonymous={<AuthMessage title="Tu espacio te espera." detail="Inicia sesión para ver tus tareas." />}
      emailPending={<AuthMessage title="Confirma tu email." detail="Necesitas verificar tu cuenta para continuar." />}
      blocked={<AuthMessage title="Acceso no disponible." detail="Tu cuenta no puede acceder a TaskFlow." />}
      unavailable={<AuthMessage title="No podemos validar tu sesión." detail="Comprueba la conexión y vuelve a intentarlo." />}
      loading={<AuthMessage title="Preparando tu espacio…" detail="Validando la sesión." />}
    >
      <TaskWorkspaceProvider>
        <div className="app-frame">
          <Sidebar />
          <main className="app-frame__main">{children}</main>
          <MobileNav />
        </div>
      </TaskWorkspaceProvider>
    </AuthBoundary>
  );
}

function AuthMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="auth-message" aria-live="polite">
      <span className="brand-mark__dot" aria-hidden="true" />
      <p className="eyebrow">TaskFlow</p>
      <h1>{title}</h1>
      <p>{detail}</p>
      <a className="text-link" href="/login">Ir al acceso</a>
    </main>
  );
}