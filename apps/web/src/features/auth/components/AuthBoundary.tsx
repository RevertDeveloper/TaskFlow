"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";

import { AccountsApiError, getCurrentUser, logout } from "@/infrastructure/accounts/client";
import { stateFromMeResponse, type AuthState } from "@/domain/auth/state";
import type { AuthUser } from "@/domain/auth/models";

type AuthContextValue = {
  state: AuthState;
  user: AuthUser | null;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

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
  const [retryNonce, setRetryNonce] = useState(0);

  const refreshAuth = async (): Promise<void> => {
    try {
      setState({ status: "loading" });
      setState(stateFromMeResponse(await getCurrentUser()));
    } catch (error: unknown) {
      if (error instanceof AccountsApiError && error.status === 403) {
        setState({ status: "blocked" });
        return;
      }
      setState({ status: "accounts-unavailable" });
    }
  };

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
  }, [retryNonce]);

  const authContext: AuthContextValue = {
    state,
    user: state.status === "authenticated" || state.status === "email-pending" ? state.user : null,
    refreshAuth,
    logout: async () => {
      await logout();
      setState({ status: "anonymous" });
    },
  };

  return (
    <AuthContext.Provider value={authContext}>
      {renderState(state, {
        children,
        anonymous,
        emailPending,
        blocked,
        unavailable,
        loading,
        onRetry: () => setRetryNonce((current) => current + 1),
      })}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe utilizarse dentro de AuthBoundary.");
  }
  return context;
}

function renderState(
  state: AuthState,
  content: Omit<AuthBoundaryProps, "children"> & { children: ReactNode; onRetry: () => void },
): ReactNode {
  switch (state.status) {
    case "authenticated":
      return content.children;
    case "anonymous":
      return content.children;
    case "email-pending":
      return content.children;
    case "blocked":
      return content.children;
    case "accounts-unavailable":
      return content.children;
    case "loading":
      return content.loading;
  }
}