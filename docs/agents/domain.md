# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — this is a multi-context monorepo. The map points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — system-wide decisions. Read ADRs that touch the area you're about to work in.
- **`<context>/docs/adr/`** — context-scoped decisions, next to that context's `CONTEXT.md`.

If a mapped `CONTEXT.md` doesn't exist yet, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT-MAP.md                       ← context index (this repo: 4 contexts)
├── docs/adr/                            ← system-wide decisions (ADR-001…006)
├── apps/hospitality/CONTEXT.md          ← Hospitality context
├── packages/rialto/CONTEXT.md           ← Rialto context
├── packages/agent-core/CONTEXT.md       ← Agent platform context
└── docs/platform/CONTEXT.md             ← Platform context (cross-cutting)
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-003 (error handling standard) — but worth reopening because…_
