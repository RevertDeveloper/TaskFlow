import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { accountsLoginUrlMock, getCurrentUserMock } = vi.hoisted(() => ({
  accountsLoginUrlMock: vi.fn((next?: string) => `https://cuenta.carlosrevert.es/login/?next=${encodeURIComponent(next ?? "/")}`),
  getCurrentUserMock: vi.fn(),
}));
const originalLocation = window.location;

vi.mock("@/infrastructure/accounts/client", () => ({
  AccountsApiError: class AccountsApiError extends Error {
    status = 0;
  },
  accountsLoginUrl: accountsLoginUrlMock,
  getCurrentUser: getCurrentUserMock,
}));

import { AuthBoundary } from "./AuthBoundary";

describe("AuthBoundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    getCurrentUserMock.mockReset();
    accountsLoginUrlMock.mockClear();
  });

  it("renders public content for an anonymous user without redirecting", async () => {
    getCurrentUserMock.mockResolvedValue({ authenticated: false, user: null });
    const replace = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { hash: "#today", pathname: "/app/dashboard", replace, search: "?focus=next" },
    });

    render(
      <AuthBoundary>
        <p>Private content</p>
      </AuthBoundary>,
    );

    expect(await screen.findByText("Private content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(accountsLoginUrlMock).not.toHaveBeenCalled();
  });

  it("renders authenticated content after Accounts confirms the session", async () => {
    getCurrentUserMock.mockResolvedValue({
      authenticated: true,
      user: {
        id: 7,
        username: "demo",
        email: "demo@example.test",
        email_verified: true,
        first_name: "Demo",
        last_name: "User",
        plan: "FREE",
      },
    });

    render(
      <AuthBoundary>
        <p>Private content</p>
      </AuthBoundary>,
    );

    expect(await screen.findByText("Private content")).toBeInTheDocument();
    expect(accountsLoginUrlMock).not.toHaveBeenCalled();
  });

  it("fails closed and offers a retry when Accounts is unavailable", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("network unavailable"));

    render(
      <AuthBoundary unavailable={<p>Accounts unavailable</p>}>
        <p>Private content</p>
      </AuthBoundary>,
    );

    expect(await screen.findByText("Accounts unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});