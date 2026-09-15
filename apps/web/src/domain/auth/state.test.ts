import { describe, expect, it } from "vitest";

import { stateFromMeResponse } from "./state";

const user = {
  id: 123,
  username: "example",
  email: "user@example.com",
  email_verified: false,
  first_name: "",
  last_name: "",
  plan: "FREE",
};

describe("stateFromMeResponse", () => {
  it("keeps anonymous sessions private", () => {
    expect(stateFromMeResponse({ authenticated: false, user: null })).toEqual({
      status: "anonymous",
    });
  });

  it("distinguishes pending email from an active session", () => {
    expect(stateFromMeResponse({ authenticated: true, user })).toEqual({
      status: "email-pending",
      user,
    });
    expect(
      stateFromMeResponse({ authenticated: true, user: { ...user, email_verified: true } }),
    ).toMatchObject({ status: "authenticated" });
  });
});