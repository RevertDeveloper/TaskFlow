# Current State

## Current Phase
Phase 13 completed

## Current Subphase
13.1-13.2 - Voice review, smart routing and atomic confirmation completed

## Current Task
Phase 13 quality gate completed; next task is Phase 14 Security, Performance & Reliability Hardening

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
- TF-1001: versioned common snapshot contract with checksum and counts
- TF-1002: verified Cloud -> Device transition with rollback
- TF-1003: verified Device -> Cloud transition with final remote pull
- TF-1004: separated local/cloud resets with strong confirmation
- TF-1005: manifest and installability metadata
- TF-1006: versioned service worker and non-destructive update flow
- TF-1007: offline, syncing, pending, device-only and error indicators
- TF-1101: frontend recorder with permission, format, size and duration limits
- TF-1102: secure ephemeral audio upload, validation and cleanup
- TF-1103: interchangeable SpeechToTextProvider and fake router provider
- TF-1104: VoiceSession state machine, HTTP 202, polling and Celery retries
- TF-1201: versioned task extraction schemas and strict JSON contract
- TF-1202: versioned prompts with transcript isolation and injection tests
- TF-1203: interchangeable task extraction provider and router
- TF-1204: strict parse, schema validation, list ownership and bounded repair retry
- TF-1205: Accounts quota reserve/validate/complete/fail for STT and LLM operations
- TF-1301: explicit/contextual/semantic/Inbox smart routing with tenant-safe list resolution
- TF-1302: versioned VoiceReviewDraft with schema validation, TTL and transcript purge policy
- TF-1303: responsive VoiceReview and VoiceTaskDraftEditor components
- TF-1304: atomic, ownership-safe and idempotent voice task confirmation

## In Progress
- None. Phase 13 is complete.

## Blockers
- `mypy config` reaches the code but reports pre-existing `unused-ignore`
	diagnostics across several API apps; the Phase 11 test/lint/build gate is
	green, but the CI typecheck baseline needs a separate cleanup.
- Real Accounts staging smoke is deferred to Phase 16 and is not a development blocker.
- Integrated browser CDP smoke could not start in this environment; frontend HTTP,
  component tests, typecheck, lint and build are green.
- The isolated frontend browser run reports `/api/v1/auth/me` as 404 because the API/reverse proxy is not part of that process; API contract and authentication tests remain green.

## Decisions
- Use Accounts session-based identity as the canonical source of identity
- Keep TaskFlow as a modular monolith
- Keep browser and API topology same-origin with TaskFlow as the authorized gateway to Accounts
- Use remote PostgreSQL as Cloud authority and IndexedDB as its operational replica
- Use IndexedDB as Device authority; enable the sync queue only in Cloud Mode.
- Add no JWT/OAuth or duplicate password system unless a separate approved ADR changes this decision
- Keep original voice audio only in per-session temporary staging; never expose it in API responses or persist it in `VoiceSession`.
- Keep the transcript in `VoiceSession` for polling/review during Phase 11; purge it after confirmation when retention is disabled.
- Keep voice review drafts separate from transcripts and audio, with a configurable TTL and idempotent confirmation.

## Last Quality Gate
Phase 13 PASS. API `pytest -q` reports 121 passed; review/routing contracts,
ownership isolation, quota lifecycle, idempotent confirmation and migration
apply/reverse pass. Web reports 58 passed, with typecheck, lint and build green.
OpenAPI validation exits 0 with no new voice warnings. Real Accounts/API
staging auth remains deferred to the smoke/deployment phase; the existing
`mypy` unused-ignore baseline and integrated browser CDP timeout remain outside
this phase.

## Last Commit
Phase 11 closeout commit series completed; see `git log` for the four traceable commits.

## Next Task
Begin Phase 14 Security, Performance & Reliability Hardening.
