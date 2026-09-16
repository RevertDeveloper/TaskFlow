# Current State

## Current Phase
Phase 5 in progress

## Current Subphase
5.1 - App shell and typed API client completed

## Current Task
TF-0501 and TF-0502 completed; next task is TF-0503

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
- TF-0301: modular domain apps created
- TF-0302: UUID, ownership, timestamps, indexes and migrations
- TF-0303: List and protected Inbox domain
- TF-0304: transactional list services
- TF-0305: Task model and invariants
- TF-0306: transactional task use cases
- TF-0307: TaskEvent audit log
- TF-0308: SyncOperation and VoiceSession MVP entities
- TF-0401: versioned REST API for lists, tasks and history
- TF-0402: selectors and module-level authenticated permissions
- TF-0208: API multi-tenant isolation tests
- TF-0403: response/error envelopes and schema contract
- TF-0404: generated and CI-validated OpenAPI contract
- TF-0405: pagination and filters
- TF-0406: health and readiness endpoints
- TF-0407: request ID and structured error correlation
- TF-0501: App Router routes and authenticated app shell
- TF-0502: typed TaskFlow API client with CSRF, timeout and request correlation

## In Progress
- Phase 5 frontend foundation: TF-0503 theme engine, TF-0504 base UI controls and TF-0505 responsive navigation.

## Blockers
- `mypy` is not installed in the available API virtual environment.
- Real Accounts staging smoke is deferred to Phase 16 and is not a development blocker.

## Decisions
- Use Accounts session-based identity as the canonical source of identity
- Keep TaskFlow as a modular monolith
- Keep browser and API topology same-origin with TaskFlow as the authorized gateway to Accounts
- Add no JWT/OAuth or duplicate password system unless a separate approved ADR changes this decision

## Last Quality Gate
Phase 4 PASS. Phase 5 first slice checks pass: web lint, strict typecheck and
6 Vitest tests. Real Accounts staging auth remains deferred to Phase 16.

## Last Commit
Pending: `feat(web): add app shell and typed api client`

## Next Task
Implement TF-0503: create tokens and ThemeProvider.
