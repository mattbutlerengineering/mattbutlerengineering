---
phase: 49
slug: dependency-synchronization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 49 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit), pnpm CLI (integration) |
| **Config file** | Root vitest workspace config |
| **Quick run command** | `pnpm --filter @mbe/cli exec tsx src/index.ts check-deps` |
| **Full suite command** | `pnpm lint && pnpm typecheck && pnpm test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mbe/cli exec tsx src/index.ts check-deps`
- **After every plan wave:** Run `pnpm lint && pnpm typecheck && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 49-01-01 | 01 | 1 | catalog-entries | integration | `pnpm --filter @mbe/cli exec tsx src/index.ts check-deps` | ✅ | ⬜ pending |
| 49-01-02 | 01 | 1 | check-deps-fix | unit | `pnpm --filter @mbe/cli test` | ✅ | ⬜ pending |
| 49-01-03 | 01 | 1 | lockfile-resolve | integration | `pnpm install --frozen-lockfile` | ✅ | ⬜ pending |
| 49-01-04 | 01 | 1 | full-suite | integration | `pnpm typecheck && pnpm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `mbe check-deps` already exists and will be the primary validation tool.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| pnpm install resolves | lockfile | pnpm lockfile resolution is env-dependent | Run `pnpm install` and verify no errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
