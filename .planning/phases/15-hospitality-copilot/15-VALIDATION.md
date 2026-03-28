---
phase: 15
slug: hospitality-copilot
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/rialto/vitest.config.ts` (existing) + `apps/hospitality/vitest.config.ts` (existing) |
| **Quick run command** | `pnpm test --filter=@mbe/rialto` |
| **Full suite command** | `pnpm test --filter=@mbe/rialto --filter=@mbe/hospitality` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --filter=@mbe/rialto`
- **After every plan wave:** Run `pnpm test --filter=@mbe/rialto --filter=@mbe/hospitality`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | COP-01, COP-04 | unit | `pnpm test --filter=@mbe/rialto` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 2 | COP-02, COP-03 | integration | `pnpm build --filter=@mbe/hospitality` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/rialto/src/components/GenCopilot/GenCopilot.test.tsx` — render test stubs for COP-01, COP-04
- [ ] Vitest already configured in packages/rialto — no new framework install needed

*Existing infrastructure covers most phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Slide-over panel opens from sidebar click | COP-01 | Visual/interactive behavior | Click "Copilot" in sidebar, verify panel slides from right |
| Generated UI uses hospitality field names | COP-03 | Requires live AI generation | Enter "show reservations for table 5", verify field names match schema |
| Theme tokens match surrounding app | COP-03 | Visual consistency check | Toggle theme, verify generated components follow |
| GenCopilot renders in any Rialto-themed app | COP-04 | Cross-app portability | Mount in a minimal test app outside hospitality |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
