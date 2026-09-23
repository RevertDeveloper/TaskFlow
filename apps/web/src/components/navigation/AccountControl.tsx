"use client";

import { LogIn, LogOut } from "lucide-react";
import { useState } from "react";

import { accountsLoginUrl } from "@/infrastructure/accounts/client";
import { useAuth } from "@/features/auth/components/AuthBoundary";

export function AccountControl() {
  const { state, user, logout } = useAuth();
  const isAuthenticated = state.status === "authenticated" || state.status === "email-pending";

  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function signOut(): Promise<void> {
    setLogoutError(null);
    try {
      await logout();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "No se pudo cerrar la sesión.");
    }
  }

  if (isAuthenticated) {
    return (
      <div className="account-control account-control--authenticated">
        <span className="account-control__identity">
          <strong>{user?.first_name || user?.username}</strong>
          <small>{state.status === "email-pending" ? "Email pendiente" : "Cuenta conectada"}</small>
        </span>
        <button className="account-control__button" type="button" onClick={() => void signOut()}>
          <LogOut size={16} aria-hidden="true" />
          <span>Cerrar sesión</span>
        </button>
        {logoutError && <p role="alert">{logoutError}</p>}
      </div>
    );
  }

  return (
    <a className="account-control account-control--login" href={accountsLoginUrl(currentPath())}>
      <LogIn size={16} aria-hidden="true" />
      <span>Iniciar sesión</span>
    </a>
  );
}

function currentPath(): string {
  if (typeof window === "undefined") {
    return "/app";
  }
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}