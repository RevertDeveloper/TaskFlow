import type {
  AuthMeResponse,
  LoginInput,
  RegisterInput,
  VerifyEmailInput,
} from "@/domain/auth/models";

const csrfCookieName = "taskflowcsrftoken";

export class AccountsApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AccountsApiError";
    this.status = status;
  }
}

export async function getCurrentUser(): Promise<AuthMeResponse> {
  const response = await fetch("/api/v1/auth/me/", {
    credentials: "include",
    cache: "no-store",
  });
  return parseResponse<AuthMeResponse>(response);
}

export async function login(input: LoginInput, next?: string): Promise<Response> {
  const response = await accountsMutation("/api/accounts/login/", input);
  redirectToNext(next);
  return response;
}

export async function register(input: RegisterInput, next?: string): Promise<Response> {
  const response = await accountsMutation("/api/accounts/register/", input);
  redirectToNext(next);
  return response;
}

export async function verifyEmail(input: VerifyEmailInput, next?: string): Promise<Response> {
  const response = await accountsMutation("/api/accounts/verify-email/", input);
  redirectToNext(next);
  return response;
}

export async function resendVerification(email: string): Promise<Response> {
  return accountsMutation("/api/accounts/verify-email/resend/", { email });
}

export async function logout(): Promise<Response> {
  return accountsMutation("/api/accounts/logout/", {});
}

export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  return next;
}

async function accountsMutation<T>(path: string, body: T): Promise<Response> {
  const csrfToken = await getCsrfToken();
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await apiError(response);
  }
  return response;
}

function redirectToNext(next: string | undefined): void {
  if (typeof window !== "undefined" && next) {
    window.location.assign(safeNextPath(next));
  }
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch("/api/accounts/csrf/", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw await apiError(response);
  }
  const token = readCookie(csrfCookieName);
  if (!token) {
    throw new AccountsApiError(0, "No se recibió el token CSRF de TaskFlow.");
  }
  return token;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const prefix = `${name}=`;
  const cookie = document.cookie.split("; ").find((value) => value.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await apiError(response);
  }
  return (await response.json()) as T;
}

async function apiError(response: Response): Promise<AccountsApiError> {
  let message = "No se pudo completar la operación de cuenta.";
  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) {
      message = payload.detail;
    }
  } catch {
    // Keep a safe generic message when the upstream is not JSON.
  }
  return new AccountsApiError(response.status, message);
}