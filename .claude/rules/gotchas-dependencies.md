---
paths:
  - "**/package.json"
  - "pnpm-lock.yaml"
  - "pnpm-workspace.yaml"
  - "**/Dockerfile"
  - ".github/dependabot.yml"
---

# Gotchas — Dependencies

Path-scoped sibling of [gotchas.md](./gotchas.md#dependencies). See also the `dependency-update-reviewer` subagent.

- **CVE `pnpm.overrides` use the scoped form `"pkg@<patched": "^patched"`**, never `"pkg": ">=patched"` — open ranges pull majors (`protobufjs@>=7.5.5` → 8.0.1).
- **The `js-yaml@<4.2.0` range override breaks `@changesets/cli`** (`safeLoad` removed in js-yaml 4). Keep the consumer-path override `"read-yaml-file>js-yaml": "3.14.1"` alongside it; consumer-path beats range.
- **Zod 4 `z.record()` needs 2 args** — `z.record(z.string(), z.unknown())`.
- **AI SDK v6 renames:** `stopWhen: stepCountIs(N)` (not `maxSteps`), `tool({ inputSchema })` (not `parameters`), text-delta `.text` (not `.textDelta`), tool-call `.input` (not `.args`). Only typecheck catches these.
- **`pnpm audit --audit-level=high` (`audit:security`, its own CI step) can red main from a newly published advisory with zero code change.** Fix with a scoped override; if unpatchable, `pnpm.auditConfig.ignoreGhsas` plus a tracking issue.
- **Audit network timeouts are retried only when `isTransientAuditError()` (`scripts/audit-transient-error.mjs`) says so** (#4993) — a real advisory still fails on attempt 1.
- **A grouped Dependabot `production-deps` PR reliably fails two jobs at once: the zod `.email()` snapshot and hospitality's bundle-size budget** (#5367, #5420, #5490).
  - Snapshot: before regenerating (`pnpm --dir services/users exec vitest run src/schemas/schemas.test.ts -u`), **differential-test the old vs new regex** — it is user-email validation, and an unchecked snapshot update approves a policy change blind.
  - Budget: re-measure first (`pnpm build --filter @mbe/hospitality && pnpm --dir apps/hospitality size:check`). Stale baseline → re-baseline in its own PR (#5480). Real jump → reject the bump.
  - The same run touches `pnpm-lock.yaml`, so expect an unrelated cold-cache timeout too (see gotchas.md § CI).
- **`ERR_PNPM_OUTDATED_LOCKFILE` on a single Dependabot bump is a different class** (#5385): its commit didn't fully resolve the lockfile.
- **Every Dockerfile that runs `pnpm install` must `COPY patches ./patches`** — root `pnpm.patchedDependencies` is hashed at install (#5677). Pinned per install by `scripts/__tests__/dockerfile-pnpm-patches.test.mjs`.
