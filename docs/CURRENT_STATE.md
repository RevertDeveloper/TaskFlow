# Current State

## Current Phase
Phase 9 completed

## Current Subphase
9.3 - Synchronization engine, backend merge and observability completed

## Current Task
Phase 9 quality gate completed; next task is Phase 10

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
- TF-0503: Stark/Minimal tokenized theme engine
- TF-0504: accessible UI base components with component tests
- TF-0505: desktop sidebar, mobile navigation and keyboard/touch list switcher
- TF-0601: frontend use-case ports and UI-only state
- TF-0602: pending task dashboard grouped by list
- TF-0603: optimistic quick task capture with Inbox default
- TF-0604: task edit, move, complete, reopen and delete workflows
- TF-0605: list creation, editing, archive/restore and deletion
- TF-0606: global and list history timeline with pagination and reopen
- TF-0701: versioned Dexie schema, metadata and non-destructive migrations
- TF-0702: IndexedDB repositories for lists, tasks, history and sync
- TF-0703: atomic LocalRepository with idempotency and controlled retries
- TF-0704: migration, corruption, quota and interrupted-commit tests
- TF-0801: canonical repository ports with compatibility reexports
- TF-0802: typed API repositories with DTO mapping and injectable clients
- TF-0803: StorageManager with Cloud/Device routing and local replica
- TF-0804: explicit authority, stale, availability and queue state policy
- TF-0805: TaskWorkspaceProvider migration and storage status indicator
- TF-0901: versioned push/pull schemas and protocol documentation
- TF-0902: authenticated push/pull endpoints with ownership and idempotency
- TF-0903: web SyncQueue, SyncTransport, ConflictResolver and SyncEngine
- TF-0904: server-authoritative LWW, conflict policy and tombstone reconciliation
- TF-0905: transactional backend merge and local replica application
- TF-0906: structured sync telemetry with request/sync/operation correlation

## In Progress
- None. Phase 9 is complete and Phase 10 is next.

## Blockers
- `mypy` is not installed in the available API virtual environment.
- Real Accounts staging smoke is deferred to Phase 16 and is not a development blocker.
- Local API services were unavailable during browser QA; deterministic fixtures covered the Phase 6 UI gate.

## Decisions
- Use Accounts session-based identity as the canonical source of identity
- Keep TaskFlow as a modular monolith
- Keep browser and API topology same-origin with TaskFlow as the authorized gateway to Accounts
- Use remote PostgreSQL as Cloud authority and IndexedDB as its operational replica
- Use IndexedDB as Device authority; enable the sync queue only in Cloud Mode.
- Add no JWT/OAuth or duplicate password system unless a separate approved ADR changes this decision

## Last Quality Gate
Phase 9 PASS. API Ruff, Django check, migration check and 76 tests pass. Web
lint, strict typecheck, 44 Vitest tests and production build pass. The Sync
matrix covers offline/reconnect, bounded retry, duplicate operation, two
devices, conflicts, cursor repetition, ownership and partial availability.
The 100-operation baseline is 210.28 ms locally. Real Accounts/API staging
auth remains deferred to the smoke/deployment phase.

## Last Commit
`c264915` - `fix(sync): enforce deterministic lww tie breaker`; Phase 9 closed.

## Next Task
Start Phase 10 according to the roadmap.
