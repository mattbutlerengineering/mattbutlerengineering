---
phase: 12
slug: catalog-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/rialto-catalog/vitest.config.ts` (Wave 0 creates) |
| **Quick run command** | `cd packages/rialto-catalog && pnpm test` |
| **Full suite command** | `pnpm test && pnpm build && pnpm typecheck` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/rialto-catalog && pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm build && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | CAT-01 | build | `pnpm build && pnpm typecheck` | ✅ | ⬜ pending |
| 12-02-01 | 02 | 1 | CAT-02 | unit | `cd packages/rialto-catalog && pnpm test` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 1 | CAT-03 | unit | `cd packages/rialto-catalog && pnpm test` | ❌ W0 | ⬜ pending |
| 12-02-03 | 02 | 1 | CAT-04 | unit | `cd packages/rialto-catalog && pnpm test` | ❌ W0 | ⬜ pending |
| 12-02-04 | 02 | 1 | CAT-05 | integration | `cd packages/rialto-catalog && pnpm test:drift` | ❌ W0 | ⬜ pending |
| 12-02-05 | 02 | 1 | CAT-06 | unit | `cd packages/rialto-catalog && pnpm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/rialto-catalog/vitest.config.ts` — vitest configuration
- [ ] `packages/rialto-catalog/src/__tests__/catalog.test.ts` — stubs for CAT-02, CAT-03, CAT-04, CAT-06
- [ ] `packages/rialto-catalog/src/__tests__/drift-check.test.ts` — stub for CAT-05
- [ ] `packages/rialto-catalog/package.json` — with vitest dev dep, test scripts

*Existing monorepo infrastructure (Turborepo, pnpm workspaces, shared config) covers build/typecheck.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `catalog.prompt()` token count exceeds 2,048 | CAT-04 | Token counting is model-specific | Run `catalog.prompt()` and count output length; verify > 2,048 tokens for Anthropic caching |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
