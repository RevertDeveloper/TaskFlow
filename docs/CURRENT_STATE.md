# Current State

## Current Phase
Phase 2

## Current Subphase
2.3 - Pruebas del contrato de identidad

## Current Task
Phase 2 completed; next executable task is TF-0301

## Completed Tasks
- TF-0001: repository inventory and repository state confirmed
- TF-0002: Accounts inspection completed with verified evidence from the external repo
- TF-0003: accounts integration contract documented
- TF-0004: same-origin and topology decision recorded
- TF-0005: quota decision recorded
- TF-0006: ADRs created
- TF-0007: risk register created
- TF-0101: approved monorepo structure created and validated
- TF-0102: Next.js strict foundation, lockfile and web checks validated
- TF-0103: Django/DRF settings, configurable database and health test validated
- TF-0104: development Compose built, started and checked over HTTP
- TF-0105: environment template, Compose interpolation and secret boundaries validated
- TF-0106: CI workflow parsed and web/API/infrastructure checks validated
- TF-0107: README and Git workflow documented
- TF-0201: identity port and normalized Accounts principal
- TF-0202: server-side Accounts session client
- TF-0203: DRF Accounts authentication, permission and service
- TF-0204: TaskFlow CSRF and /auth/me/ endpoints
- TF-0202a: Accounts auth proxy with allowlisted routes
- TF-0205: delegated web auth client
- TF-0206: frontend authentication states and AuthBoundary
- TF-0207: backend authentication, proxy and permission tests

## In Progress
- None. Phase 3 is ready to start.

## Blockers
- `mypy` is not installed in the available API virtual environment.
- Real Accounts staging smoke is deferred to Phase 16 and is not a development blocker.

## Decisions
- Use Accounts session-based identity as the canonical source of identity
- Keep TaskFlow as a modular monolith
- Keep browser and API topology same-origin with TaskFlow as the authorized gateway to Accounts
- Add no JWT/OAuth or duplicate password system unless a separate approved ADR changes this decision

## Last Quality Gate
Phase 2 PASS. Contract fixtures, no JWT/secrets, adapter and frontend checks
pass. Resource ownership tests belong to their resource phases; real staging
auth is deferred to Phase 16.

## Last Commit
0ccb9dc - feat(auth): integrate Accounts session boundary

## Next Task
Implement TF-0301 and TF-0302. Add ownership tests with each domain resource;
do not block domain work on staging validation.
