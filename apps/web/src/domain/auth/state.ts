import type { AuthMeResponse, AuthUser } from "./models";

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: AuthUser }
  | { status: "email-pending"; user: AuthUser }
  | { status: "blocked" }
  | { status: "accounts-unavailable" };

export function stateFromMeResponse(response: AuthMeResponse): AuthState {
  if (!response.authenticated) {
    return { status: "anonymous" };
  }
  return response.user.email_verified
    ? { status: "authenticated", user: response.user }
    : { status: "email-pending", user: response.user };
}