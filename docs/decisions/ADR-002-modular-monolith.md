# ADR-002: Keep the architecture as a modular monolith

- Status: Accepted
- Date: 2026-09-15

## Context

The roadmap explicitly states that the project should remain a monolith with modular boundaries rather than introducing early microservices, separate worker clusters, or a distributed event bus.

## Decision

TaskFlow will be built as a modular monolith with clear boundaries:

- Presentation layer: Next.js frontend
- Application layer: use cases and orchestration
- Domain layer: business rules and invariants
- Repository interfaces
- Infrastructure and persistence layer: Django ORM, REST, Dexie, provider integrations, Celery where justified

## Why this decision

- It fits the initial product stage and constraints of the roadmap.
- It avoids over-engineering before the product and auth architecture are validated.
- It allows a future migration to more services without creating an artificial system boundary now.

## Consequences

### Positive

- Simpler deployment and operational model
- Easier tracing and testing in the early phases
- Clear separation of responsibilities without distributed complexity

### Negative

- Some architectural choices may later need to be decomposed if scale requires it
- The team must enforce layer boundaries carefully to avoid leaky dependencies

## Alternatives considered

### Microservice split

Rejected because it would add operational burden and does not match the roadmap requirement for a monolith.

### Frontend directly using provider SDKs and DB logic

Rejected because it violates the architecture principles and creates untestable, tightly coupled presentation logic.

## Follow-up

The implementation must preserve layer boundaries and keep any provider-specific logic inside infrastructure adapters rather than in UI or Django serializers.
