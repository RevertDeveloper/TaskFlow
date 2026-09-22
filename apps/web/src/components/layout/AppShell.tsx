"use client";

import type { ReactNode } from "react";
import Image from "next/image";

import { MobileNav } from "@/components/navigation/MobileNav";
import { Sidebar } from "@/components/navigation/Sidebar";
import { PwaRegistration } from "@/components/pwa/PwaRegistration";
import { ProfileStorageManager } from "@/application/storage/ProfileStorageManager";
import { AuthBoundary } from "@/features/auth/components/AuthBoundary";
import { TaskWorkspaceProvider } from "@/features/tasks/application/TaskWorkspaceProvider";
import { useAuth } from "@/features/auth/components/AuthBoundary";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <AuthBoundary
      loading={<AuthMessage title="Preparando tu espacio…" detail="Validando la sesión." />}
    >
      <AuthenticatedAppShell>{children}</AuthenticatedAppShell>
    </AuthBoundary>
  );
}

function AuthenticatedAppShell({ children }: AppShellProps) {
  const [profileStorage] = useState(() => new ProfileStorageManager());
  const { user } = useAuth();
  const pathname = usePathname();
  const isNotesWorkspace = pathname === "/app";

  useEffect(() => {
    void profileStorage.setUser(user).catch(() => undefined);
  }, [profileStorage, user]);

  return (
    <TaskWorkspaceProvider storageManager={profileStorage}>
      <div className={isNotesWorkspace ? "app-frame app-frame--notes" : "app-frame"}>
        {isNotesWorkspace ? children : <><Sidebar /><main className="app-frame__main">{children}</main><MobileNav /></>}
        <PwaRegistration />
      </div>
    </TaskWorkspaceProvider>
  );
}

function AuthMessage({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <main className="auth-message" aria-live="polite">
      <Image
        className="auth-message__logo"
        src="/LogoFavicon/TaskFlow-Favicon.jpeg"
        alt="TaskFlow"
        width={112}
        height={112}
        priority
      />
      <p className="eyebrow">TaskFlow</p>
      <h1>{title}</h1>
      <p>{detail}</p>
      {action}
    </main>
  );
}