"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { AccountsApiError, getCurrentUser } from "@/infrastructure/accounts/client";
import { stateFromMeResponse, type AuthState } from "@/domain/auth/state";

type AuthBoundaryProps = {
  children: ReactNode;
  anonymous?: ReactNode;
  emailPending?: ReactNode;
  blocked?: ReactNode;
  unavailable?: ReactNode;
  loading?: ReactNode;
};

export function AuthBoundary({
  children,
  anonymous = <p>Inicia sesión para continuar.</p>,
  emailPending = <p>Verifica tu email para continuar.</p>,
  blocked = <p>Tu cuenta no puede acceder a TaskFlow.</p>,
  unavailable = <p>La identidad no está disponible ahora.</p>,
  loading = <p>Cargando sesión...</p>,
}: AuthBoundaryProps) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void getCurrentUser()
      .then((response) => {
        if (active) {
          setState(stateFromMeResponse(response));
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        if (error instanceof AccountsApiError && error.status === 403) {
          setState({ status: "blocked" });
          return;
        }
        setState({ status: "accounts-unavailable" });
      });

    return () => {
      active = false;
    };
  }, []);

  return renderState(state, { children, anonymous, emailPending, blocked, unavailable, loading });
}

function renderState(
  state: AuthState,
  content: Omit<AuthBoundaryProps, "children"> & { children: ReactNode },
): ReactNode {
  switch (state.status) {
    case "authenticated":
      return content.children;
    case "anonymous":
      return content.anonymous;
    case "email-pending":
      return content.emailPending;
    case "blocked":
      return content.blocked;
    case "accounts-unavailable":
      return content.unavailable;
    case "loading":
      return content.loading;
  }
}