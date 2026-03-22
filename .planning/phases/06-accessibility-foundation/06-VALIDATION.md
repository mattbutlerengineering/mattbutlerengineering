---
phase: 6
slug: accessibility-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `packages/rialto/vitest.config.ts` |
| **Quick run command** | `cd packages/rialto && pnpm test` |
| **Full suite command** | `pnpm test` (from monorepo root) |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/rialto && pnpm test`
- **After every plan wave:** Run `pnpm test` (from monorepo root)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | A11Y-01, A11Y-10 | unit | `cd packages/rialto && npx vitest run src/test/token-contrast.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | A11Y-08 | unit | `cd packages/rialto && npx vitest run src/test/focus-management.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | A11Y-01 | unit | `cd packages/rialto && npx vitest run src/test/token-contrast.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | A11Y-02 | unit+manual | `cd packages/rialto && pnpm test` | ✅ partial | ⬜ pending |
| 06-04-01 | 04 | 2 | A11Y-04, A11Y-03 | unit (axe) | `cd packages/rialto && pnpm test` | ✅ partial | ⬜ pending |
| 06-05-01 | 05 | 3 | A11Y-08 | unit | `cd packages/rialto && pnpm test` | ❌ W0 | ⬜ pending |
| 06-06-01 | 06 | 3 | A11Y-06, A11Y-07 | unit (axe) | `cd packages/rialto && pnpm test` | ✅ partial | ⬜ pending |
| 06-07-01 | 07 | 3 | A11Y-05 | unit+manual | `cd packages/rialto && pnpm test` | ✅ partial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/rialto/src/test/token-contrast.test.ts` — stubs for A11Y-01, A11Y-10 (programmatic WCAG contrast verification)
- [ ] `packages/rialto/src/test/focus-management.test.ts` — stubs for A11Y-08 (focus return on overlay close)

*Existing axe infrastructure (`vitest-axe`, `accessibility.test.tsx`) covers all other requirements — no framework installs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Focus-visible outlines visible to human eye | A11Y-02 | Visual appearance — axe can detect missing `:focus-visible` but not ring visibility/contrast | Tab through rialto-web showcase with mouse disconnected; verify gold ring on every interactive element |
| Screen reader announces Toast/Alert updates | A11Y-06 | jsdom has no screen reader engine | Open hospitality app → trigger success toast → verify VoiceOver announces; trigger error alert → verify assertive announcement |
| Focus trap wraps correctly in overlays | A11Y-05 | Tab cycling requires keyboard interaction timing | Open Dialog → Tab repeatedly → verify focus stays within; Shift+Tab from first element → focus wraps to last |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
