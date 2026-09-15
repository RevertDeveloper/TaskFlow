# Risk Register

## Critical risks

### R-001: Accounts identity contract mismatch

- Risk: TaskFlow assumes an auth model that differs from the real Accounts service.
- Impact: user access control, private data leaks, and broken sessions.
- Mitigation: use only the verified session contract and proxy all identity checks server-side.
- Current status: mitigated by discovery and contract documentation, but still requires external staging validation before Foundation.

### R-002: Session and CSRF mismatch

- Risk: browser requests to the wrong domain or to Accounts directly could break CSRF and cookie trust.
- Impact: auth failures or invalid cross-origin requests.
- Mitigation: use a same-origin TaskFlow browser model and server-side proxy to Accounts.
- Current status: decision closed in the roadmap and contract docs.

### R-003: Secret management and environment drift

- Risk: internal `taskflow` service key or provider credentials are exposed in the wrong place.
- Impact: security breach or failed quota validation.
- Mitigation: keep secrets in the runtime environment only and never document them in repo files.
- Current status: external environment requirement remains blocked until provisioning is performed in staging.

## High risks

### R-004: Sync conflict and ownership ambiguity

- Risk: local and cloud data can conflict when the same task is changed on multiple devices.
- Impact: data loss or silent overwrite.
- Mitigation: define `Last Write Wins` as the initial policy and document it as a deliberate decision.
- Current status: open until Phase 7 is reached.

### R-005: AI provider failure

- Risk: STT or LLM processing can fail, time out, or produce untrusted output.
- Impact: user trust loss and corrupted task data.
- Mitigation: provider abstraction, validation, retry bounds, and schema enforcement.
- Current status: open until Phase 11 and later.

### R-006: Local database migration and device persistence

- Risk: browser/database changes can break local task persistence or migration paths.
- Impact: loss of local data or failed startup.
- Mitigation: use explicit schema and migration policy under the storage abstraction.
- Current status: deferred to foundation and later storage phases.

## Medium risks

### R-007: TaskFlow not yet registered as a quota consumer

- Risk: AI actions may be executed without verified quota reservation.
- Impact: unbounded usage or inconsistent billing.
- Mitigation: `taskflow` must be created in Accounts as a valid client with quota enabled.
- Current status: requires external Accounts environment work.

### R-008: Domain and proxy topology mismatch

- Risk: incorrect DNS or proxy configuration could hide the real browser topology.
- Impact: unexpected CORS, auth, and routing bugs.
- Mitigation: use the document topology and validate once the staging environment is available.
- Current status: blocked externally.

## Status summary

- Critical blockers are explicitly documented.
- The roadmap can continue only after external validation satisfies the environment-dependent requirements or the blocker is documented as a project decision.
