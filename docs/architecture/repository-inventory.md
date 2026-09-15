# Repository Inventory

## Scope

This document records the actual state of the TaskFlow repository and the verified external contract it must integrate with. It is a working inventory for the discovery phase and must not be treated as an implementation plan beyond Phase 0.

## Current repository state

### TaskFlow repository

- Path: `/home/revert/Repositorios/TaskFlow`
- Repository type: documentation-only at the time of discovery
- Verified files at root:
  - `docs/`
  - `.git/`
- Verified documents:
  - `docs/ROADMAP.md`
  - `docs/CURRENT_STATE.md` (empty placeholder)
  - `docs/InformeTecnico.md`
  - `docs/InformeMaestro`
- Verified absence:
  - No `apps/` directory
  - No backend code under `api/`, `server/`, `src/`, `packages/`, or `infra/`
  - No web app scaffold or package manifests
  - No working database configuration or deployment manifests for TaskFlow itself

### External identity authority

- Path: `/home/revert/Repositorios/carlosrevert-accounts`
- Verified framework: Django 5.2.16, Python 3.12
- Verified auth model: `apps.users.models.User`
- Verified auth mechanism: Django session-based authentication, `SessionAuthentication`, no JWT/OAuth/OIDC
- Verified integration contract: `GET /api/v1/auth/me/`, `GET /api/v1/auth/csrf/`, session cookie domain `.carlosrevert.es`, `CORS_ALLOW_CREDENTIALS = True`

## Verified operating facts

### Git and branch state

- Current branch: `main`
- Working tree: clean at the time of discovery
- Recent history observed:
  - `5c9ec6d Actualizacion de roadmap con mejoras y inclusion de current_state`
  - `cc11ee3 Documentos inciales. Informes y Roadmap`

### Secrets and environment handling

- No production or staging secrets were copied into this repository as part of the discovery work.
- No values from `.env` files were stored in the documentation.
- The operational rule is: secrets remain inside the target runtime environment, not in TaskFlow docs or repo files.

### Architectural implications

- TaskFlow has no implementation to preserve; the repo is effectively a greenfield project for the first phases of the roadmap.
- The implementation must not assume JWT or custom auth. The identity authority is the external Accounts service.
- Any provider or app integration must be modeled as a server-to-server or browser-to-TaskFlow API flow that uses the real Accounts session contract rather than an invented one.

## Registry of confirmed references

- `carlosrevert-accounts/config/settings/base.py`
- `carlosrevert-accounts/apps/api/views.py`
- `carlosrevert-accounts/README.md`
- `carlosrevert-accounts/docs/roadmapIntegracion.md`
- `TaskFlow/docs/ROADMAP.md`

## Known unknowns

- The staging or production registration of `taskflow` as a ClientApplication is not verifiable from this repository.
- The actual service key for `taskflow` in staging cannot be inspected here.
- The TaskFlow deployment topology (reverse proxy, domains, ports) is prescribed by the roadmap but not yet available in repo content.

## Decision status

- `DECISION CERRADA`: same-origin browser flow to `https://taskflow.carlosrevert.es` using TaskFlow backend as a proxy to Accounts.
- `DECISION CERRADA`: no JWT/OAuth implementation in TaskFlow unless explicitly approved later by an ADR and by the Accounts contract itself.
- `UNKNOWN`: taskflow app registration and quota service key provisioning in staging.

## Output for the next phase

Foundation must start from this validated state only after the external Accounts staging configuration is confirmed or explicitly documented as a blocker.
