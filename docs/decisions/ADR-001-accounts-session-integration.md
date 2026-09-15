# ADR-001: Use the Accounts session as the source of identity

- Status: Accepted
- Date: 2026-09-15

## Context

The external identity system `carlosrevert-accounts` is a Django app that authenticates users using Django sessions and cookies. The real app does not expose JWTs, OAuth tokens, or OIDC. Roadmap and product documents initially proposed token-based flows, but the verified contract shows session-based auth is the actual source of truth.

## Decision

TaskFlow will use the Accounts session contract as the canonical identity mechanism. Browser requests to TaskFlow will be authenticated server-side by revalidating the current user with an `AccountsSessionAdapter` against `GET /api/v1/auth/me/` while forwarding the cookie through the TaskFlow backend.

## Why this decision

- It matches the verified Accounts implementation.
- It avoids inventing a parallel auth model that would diverge from the production authority.
- It keeps secret material in the server side instead of the browser.
- It preserves session revocation and access control under the identity authority that owns the users.

## Consequences

### Positive

- No local password system or duplicated auth secret is required.
- Identity and session validity remain controlled by the Accounts service.
- Risk of mismatching the real production contract is reduced.

### Negative

- TaskFlow depends on the external Accounts service availability for private flows.
- The backend must be careful not to create stale identity caches.
- Cross-subdomain or proxy topology must be configured correctly.

## Alternatives considered

### Local JWT model

Rejected because the repository does not contain any JWT/OAuth support and the external service does not issue those tokens.

### Browser direct call to Accounts

Rejected because it violates the same-origin and CSRF policy and exposes the identity domain to a browser-proxied flow.

### Local password database

Rejected because that would create duplicate user identity and contradict the architecture requirement that identity remains delegated to Accounts.

## Follow-up

The implementation must document session validation and proxying in the integration contract and keep request-time validation as the default.
