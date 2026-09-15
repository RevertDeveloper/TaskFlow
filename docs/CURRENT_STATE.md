# Current State

## Current Phase
Phase 2

## Current Subphase
2.3 - Aislamiento y pruebas

## Current Task
TF-0208 blocked: domain resources required for A/B isolation tests do not exist yet

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
- TF-0206: frontend authentication states and AuthBoundary
- TF-0207: backend authentication, proxy and permission tests

## In Progress
- TF-0202a: Accounts auth proxy implemented; real HTTPS acceptance pending
- TF-0205: delegated web client implemented; real-session E2E pending

## Blockers
- TF-0208: lists/tasks/history/sync/voice resources are scheduled for later phases,
  so their A/B isolation tests cannot be honestly closed in Phase 2.
- TF-0209: staging HTTPS session fixtures are not available for real login/logout E2E.
- `mypy` is not installed in the available API virtual environment.

## Decisions
- Use Accounts session-based identity as the canonical source of identity
- Keep TaskFlow as a modular monolith
- Keep browser and API topology same-origin with TaskFlow as the authorized gateway to Accounts
- Add no JWT/OAuth or duplicate password system unless a separate approved ADR changes this decision

## Last Quality Gate
Phase 2 NOT COMPLETE. Contract fixtures, no JWT/secrets, adapter and frontend
checks pass; real staging auth, A/B isolation and E2E remain open.

## Last Commit
0ccb9dc - feat(auth): integrate Accounts session boundary

## Next Task
Resolve the Phase 2 blockers: add domain ownership tests when Phase 3/4 resources
exist and run real Accounts staging E2E for TF-0202a, TF-0205 and TF-0209.
