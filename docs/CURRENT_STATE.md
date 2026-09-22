# Current State

## Current Phase
Phase 16 implementation complete; local production gate green, external signoff pending

## Current Subphase
16.1-16.4 - Production artifacts, runtime smoke and isolated recovery drill validated

## Current Task
Close the remaining external Phase 16 gate with real Accounts HTTPS login/logout,
a rollback against a previous release, connected alert delivery and manual
accessibility signoff.

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
- TF-1401: auth, authorization and multi-tenancy security review
- TF-1402: CSRF, same-origin, cookies and security headers review
- TF-1403: input, audio upload and rate-limit review
- TF-1404: AI prompt, schema, retention and provider-secret review
- TF-1405: reproducible API and IndexedDB performance baselines
- TF-1406: IndexedDB history pagination optimization based on baseline
- TF-1407: timeout, retry, idempotency and failure policy
- TF-1408: data-loss drills, including PostgreSQL backup/restore
- TF-1501: backend unit/service test evidence and API coverage gate
- TF-1502: API integration, auth, permission, health and readiness test evidence
- TF-1503: OpenAPI, JSON Schema and generated-client contract validation
- TF-1504: frontend unit/component coverage gate at 60% minimum
- TF-1505: frontend integration coverage for repositories, mode switch and sync
- TF-1506: Playwright release-candidate suite for desktop and mobile Chromium
- TF-1507: versioned Phase 15 test matrix in `docs/qa/test-matrix.md`
- TF-1508: release checklist and evidence in `docs/qa/release-checklist.md`
- TF-1601: separated development, test, staging and production Compose environments
- TF-1602: multi-stage non-root images, healthchecks and explicit migrations
- TF-1603: release workflow with quality gate, image scan and protected promotion jobs
- TF-1604: application/database/prompt rollback runbook
- TF-1605: structured logs, protected metrics and operational observability docs
- TF-1606: versioned Prometheus alert rules and activation notes
- TF-1607: backup/restore scripts with retention, checksum and restore runbook
- TF-0209: implementation path and smoke evidence template prepared; real staging pending
- Local production promotion: standalone Next runtime, API, worker, PostgreSQL and Redis healthy on the documented ports
- Anonymous private-route smoke: public TaskFlow redirects to the single Accounts login with a safe `next` URL
- Backup/restore drill: isolated Compose project restored a checksum-verified PostgreSQL backup, migrated and returned readiness 200

## In Progress
- Real Accounts HTTPS login/logout/session-expiry smoke, previous-release rollback,
    connected alert delivery and manual accessibility QA remain pending.

## Blockers
- `ACCOUNTS_TASKFLOW_SERVICE_KEY` is not provisioned in this workspace. It must
    be rotated once in Accounts Admin and stored only in the secure staging/
    production environment.
- The public anonymous flow is operational; authenticated smoke still requires
    a protected demo account and real Accounts session.
- Real Accounts HTTPS smoke, session expiry, CSRF and shared-cookie checks are
    pending a staging domain and demo account.
- Backup/restore has passed in an isolated local Compose drill; rollback against
    a previous release still requires staging history.
- Alert rules are versioned; Prometheus/exporters and a test alert are not
    connected in this workspace.

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
Local production checks are green: web lint/typecheck/tests/build, API suite
`128 passed`, Django `check --deploy` with zero errors, Compose config, shell
syntax, standalone runtime health, public anonymous redirect, and isolated
backup/restore/readiness drill. The Phase 16 gate remains open only for the
external Accounts session smoke, previous-release rollback, connected alerts
and manual accessibility signoff.

## Last Commit
Phase 15 evidence commit series completed: `0f3cff4`, `a4996e9` and `a6c04b3`.

## Next Task
Provision or select the protected staging Accounts demo and run the release
workflow; record real HTTPS session, rollback, alert and accessibility evidence
before declaring Phase 16 complete.
