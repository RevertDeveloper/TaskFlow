"use client";

import type { ReactNode } from "react";

import { AuthBoundary } from "@/features/auth/components/AuthBoundary";

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
      <div className="app-frame">
        <aside className="app-frame__sidebar" aria-label="Navegación principal">
          <a className="brand-mark" href="/app/dashboard" aria-label="TaskFlow, ir al panel">
            <span className="brand-mark__dot" aria-hidden="true" />
            <span>TaskFlow</span>
          </a>
          <nav className="app-nav">
            <a href="/app/dashboard" aria-current="page">Panel</a>
            <a href="/app/lists">Listas</a>
            <a href="/app/history">Historial</a>
            <a href="/app/settings">Ajustes</a>
          </nav>
        </aside>
        <main className="app-frame__main">{children}</main>
      </div>
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