# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) documenting significant technical decisions made in the mattbutlerengineering monorepo.

## Index

| ADR                                             | Title                                            | Status | Date       |
| ----------------------------------------------- | ------------------------------------------------ | ------ | ---------- |
| [ADR-001](ADR-001-rialto-over-tailwind.md)      | Design System Unification (Rialto over Tailwind) | active | 2026-03-28 |
| [ADR-002](ADR-002-api-versioning-strategy.md)   | API Versioning Strategy                          | active | 2026-04-06 |
| [ADR-003](ADR-003-error-handling-standard.md)   | Error Handling Standard                          | active | 2026-04-06 |
| [ADR-004](ADR-004-health-check-patterns.md)     | Health Check Patterns                            | active | 2026-04-06 |
| [ADR-005](ADR-005-service-authentication.md)    | Service Authentication                           | active | 2026-04-06 |
| [ADR-006](ADR-006-edge-routing-architecture.md) | Edge Routing Architecture                        | active | 2026-04-06 |

## Format

Each ADR follows this structure:

- **Context** -- What problem are we solving?
- **Decision** -- What did we decide?
- **Consequences** -- What are the trade-offs?
- **Alternatives Considered** -- What else did we evaluate?

## Statuses

| Status       | Meaning                 |
| ------------ | ----------------------- |
| `active`     | Currently in effect     |
| `superseded` | Replaced by a newer ADR |
| `deprecated` | No longer relevant      |

## Adding a New ADR

1. Copy an existing ADR as a template.
2. Use the next sequential number: `ADR-NNN-short-title.md`.
3. Fill in all four sections (Context, Decision, Consequences, Alternatives).
4. Add an entry to the index table above.
