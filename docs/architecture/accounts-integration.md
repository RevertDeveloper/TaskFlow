# Accounts Integration Contract

## Purpose

This document defines the real integration contract between TaskFlow and the external identity system `carlosrevert-accounts`. It is the authoritative contract for Phase 0 and must be treated as the source of truth for any authentication adapter or proxy implementation.

## Verified contract

### Identity authority

The identity authority is the Django app in `/home/revert/Repositorios/carlosrevert-accounts`.

Verified implementation facts:

- Django 5.2.16
- Python 3.12
- `SessionAuthentication` is enabled in DRF
- `AUTHENTICATION_BACKENDS` includes `EmailOrUsernameModelBackend`
- `SESSION_COOKIE_DOMAIN = .carlosrevert.es` in production settings
- `CSRF_TRUSTED_ORIGINS` is configured via env
- `CORS_ALLOW_CREDENTIALS = True`
- `GET /api/v1/auth/me/` returns authenticated state and normalized user payload
- No JWT/OAuth/OIDC issuance or validation exists in the real app

### Public endpoints

| Endpoint | Purpose | Notes |
|---|---|---|
| `GET /api/v1/auth/csrf/` | Issue CSRF cookie | Public, browser credentialed |
| `GET /api/v1/auth/me/` | Inspect current session | Public, session cookie required |
| `POST /api/v1/auth/login/` | Log in to Accounts | Session-based and CSRF-aware |
| `POST /api/v1/auth/logout/` | Log out from Accounts | Requires active session and CSRF |
| `POST /api/v1/auth/register/` | Register a new account | Requires CSRF |
| `POST /api/v1/auth/verify-email/` | Verify email and start session | Requires CSRF |
| `POST /api/v1/auth/verify-email/resend/` | Resend verification code | Requires CSRF |
| `GET /api/v1/usage/summary/` | Read quota | Session-authenticated |
| `GET /health/` | Healthcheck | Not identity proof |

### User payload for `/api/v1/auth/me/`

The real payload shape is:

```json
{
  "authenticated": true,
  "user": {
    "id": 123,
    "username": "example",
    "email": "user@example.com",
    "email_verified": true,
    "first_name": "",
    "last_name": "",
    "plan": "FREE"
  }
}
```

For anonymous sessions:

```json
{
  "authenticated": false,
  "user": null
}
```

## Identity mapping plan

TaskFlow must map the external identity from Accounts into its own local notion of user identity without inventing separate passwords or auth tokens.

Required rule:

- `Accounts.User.id` -> TaskFlow `external_user_id` or equivalent external id field
- Never trust browser-provided identity data
- Always revalidate session by calling Accounts via the backend

## Cookie, CSRF and same-origin rules

### Required browser policy

- Browser origin is: `https://taskflow.carlosrevert.es`
- It must not call Accounts directly from a browser
- It must not trust any browser-supplied `user_id` or session cookie
- TaskFlow backend must own the browser-facing auth boundary

### Required browser flow

1. Browser calls TaskFlow frontend or TaskFlow backend API.
2. TaskFlow backend uses a server-side adapter to call Accounts with the incoming authenticated cookie.
3. Accounts validates the session and returns the current user.
4. TaskFlow normalizes and authorizes the identity server-side.

### CSRF policy

- For browser requests that mutate TaskFlow state, TaskFlow must own and validate its own CSRF token.
- For any browser-facing proxy action toward Accounts, TaskFlow backend is the caller; it reuses the Accounts cookie and CSRF as required, but never exposes the secret or cookie to the browser.
- The frontend must not implement custom validation against Accounts secret material.

## Failure modes and supported behaviors

### Anonymous

- `/api/v1/auth/me/` returns `authenticated: false`
- TaskFlow must treat the user as unauthenticated and deny private resource access

### Email-unverified user

- User exists but email verification is pending
- TaskFlow must treat the authenticated session as valid but not yet eligible for privileged operations that require full account activation, if those are later defined in roadmap

### Blocked or inactive user

- Accounts may return a valid user record but active status or blocking rules can prevent behavior
- TaskFlow must not bypass those rules in its own session authorization layer

### Accounts unavailable

- Session validation fails or timeout occurs
- TaskFlow must fail closed for private routes and must not create a local trust decision based on stale browser identity

## Timing and timeout rules

- Use short explicit HTTP timeouts for session validation requests
- Do not cache `/auth/me/` in shared caches or CDN layers during MVP
- No long-lived user identity cache should be created in the frontend or TaskFlow API
- Session revocation must be honored immediately by revalidation at request time

## Quota integration

The Accounts quota model is not a replacement for user auth. It is a separate internal service contract.

Required policy:

- Manual task creation and edits are not quota-consuming operations
- AI operations may reserve quota before processing
- Reservation must include a single request id and should be completed or failed once only
- `before_processing` is a refund-eligible error code in the Accounts config

## Non-goals and prohibited behaviors

Not allowed in TaskFlow:

- local JWT issuance
- custom OAuth flow
- local password storage
- direct browser-to-Accounts calls with `credentials: include` without TaskFlow backend mediation
- duplicated secret values from Accounts
- Browser trust of `user_id` passed from the client
- reading or parsing Django session cookies in a way that bypasses the Accounts contract

## Implementation checklist for the adapter

An `AccountsSessionAdapter` should at minimum support:

- `get_current_user(request)`
- `require_authenticated_user(request)`
- `ensure_csrf_cookie()` or backend proxy flow
- `logout_user(request)`
- `normalize_account_user(payload)`
- `is_accounts_unavailable(error)`

## Validation evidence required

Before moving from Phase 0 to Foundation, the following must be validated in a real environment:

- login to Accounts works in staging
- `/auth/me/` returns session state correctly
- session cookies are restricted to the `.carlosrevert.es` domain
- logout invalidates the session
- TaskFlow backend can proxy the call without exposing cookies to the browser
- quota reservation fails closed when Accounts rejects a request

## Status

This document is approved as the fact-based contract for Phase 0 discovery. The remaining external validation items are environment-dependent and remain blocked until the relevant staging or production configuration exists.
