# ADR-003: Separate cloud persistence from local device persistence

- Status: Accepted
- Date: 2026-09-15

## Context

The roadmap requires a hybrid storage strategy: a browser local store for fast personal task access and a cloud-backed store for authenticated multi-user workflows. The design must be explicit about when data is local-only and when it is cloud-synced.

## Decision

TaskFlow will define a storage abstraction that hides whether the backend is local device mode or cloud mode. The local strategy will use IndexedDB/Dexie when appropriate, while the cloud strategy will rely on PostgreSQL and Django APIs. The public UI will consume a storage manager rather than hard-wiring direct Dexie or fetch access into components.

## Why this decision

- It respects the layered architecture and keeps data access behind a dedicated abstraction.
- It supports the eventual cloud/device design without coupling UI components to persistence technology.
- It creates a clean seam for testing and future migration.

## Consequences

### Positive

- UI code remains storage-agnostic
- Device and cloud behavior can be tested independently
- Data ownership and sync policy remain explicit

### Negative

- Sync conflict and ownership rules must be defined and tested carefully
- Local and cloud mode drift can create hidden bugs if the abstraction is not enforced

## Alternatives considered

### Direct Dexie access from React components

Rejected because it violates the architecture principles and leaks persistence infrastructure into the presentation layer.

### Direct raw fetch from components

Rejected because it bypasses application-layer orchestration and business validation.

## Follow-up

The implementation must define the storage abstraction and conflict policy before enabling cloud sync or local-only operations.
