# Current State

## Current Phase
Phase 0

## Current Subphase
0.3 - Contratos y ADR iniciales

## Current Task
Discovery and architecture validation for the external Accounts contract; roadmap does not yet authorize implementation of Foundation tasks.

## Completed Tasks
- TF-0001: repository inventory and repository state confirmed
- TF-0002: Accounts inspection completed with verified evidence from the external repo
- TF-0003: accounts integration contract documented
- TF-0004: same-origin and topology decision recorded
- TF-0005: quota decision recorded
- TF-0006: ADRs created
- TF-0007: risk register created

## In Progress
- External environment validation of `taskflow` in Accounts staging/production
- Configure and verify the TaskFlow proxy upstream; public HTTPS currently returns `502 Bad Gateway`

## Blockers
- Public TaskFlow HTTPS currently returns `502 Bad Gateway`, so the proxy upstream is not serving a TaskFlow application yet
- Browser and proxy validation of same-origin topology cannot be completed while the TaskFlow upstream is unavailable
- Service key provisioning and authenticated quota calls in staging remain unverified from this repository

## Decisions
- Use Accounts session-based identity as the canonical source of identity
- Keep TaskFlow as a modular monolith
- Keep browser and API topology same-origin with TaskFlow as the authorized gateway to Accounts
- Add no JWT/OAuth or duplicate password system unless a separate approved ADR changes this decision

## Last Quality Gate
Phase 0 discovery gate: Accounts anonymous `/auth/me/` smoke check passes, but the TaskFlow origin returns `502 Bad Gateway`; gate remains FAIL/PENDING

## Last Commit
0daafcc - docs(phase0): add accounts discovery and architecture artifacts

## Next Task
Phase 1 can begin only after the external Accounts registration and staging validation are either completed or explicitly documented as a project blocker.
