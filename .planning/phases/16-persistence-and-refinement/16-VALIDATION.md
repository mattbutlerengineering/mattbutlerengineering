---
phase: 16
slug: persistence-and-refinement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `services/agent/vitest.config.ts` (existing) + `apps/gen/vitest.config.ts` (if exists) |
| **Quick run command** | `pnpm test --filter=@mbe/agent-service` |
| **Full suite command** | `pnpm test --filter=@mbe/agent-service --filter=@mbe/gen` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --filter=@mbe/agent-service`
- **After every plan wave:** Run `pnpm test --filter=@mbe/agent-service --filter=@mbe/gen`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | PERS-01 | unit | `pnpm test --filter=@mbe/agent-service` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 2 | PERS-02, PERS-03 | integration | `pnpm build --filter=@mbe/gen` | ✅ | ⬜ pending |
| 16-03-01 | 03 | 3 | PERS-04 | integration | `pnpm build --filter=@mbe/gen` | ✅ | ⬜ pending |
| 16-04-01 | 04 | 4 | PERS-05 | integration | `pnpm build --filter=@mbe/gen` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `services/agent/src/routes/specs.test.ts` — route test stubs for PERS-01 CRUD endpoints
- [ ] Vitest already configured in services/agent — no new framework install needed

*Existing infrastructure covers most phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Replay generates new streaming result | PERS-02 | Requires live AI streaming | Click replay on history entry, verify new streaming result appears |
| Permalink loads in fresh browser | PERS-04 | Cross-session browser test | Copy permalink, open in incognito, verify spec renders |
| Refinement patches existing spec | PERS-05 | Requires live AI + visual diff | Enter refinement, type "make button larger", verify incremental update |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
