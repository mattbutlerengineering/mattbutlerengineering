---
phase: 13
slug: ai-generation-endpoint
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `services/agent/vitest.config.ts` (existing) |
| **Quick run command** | `cd services/agent && pnpm test` |
| **Full suite command** | `pnpm test && pnpm build && pnpm typecheck` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd services/agent && pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm build && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite + manual SSE curl test
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 13-01-01 | 01 | 1 | GEN-01, GEN-02 | unit/integration | `cd services/agent && pnpm test` | ⬜ pending |
| 13-01-02 | 01 | 1 | GEN-03, GEN-04 | unit | `cd services/agent && pnpm test` | ⬜ pending |
| 13-01-03 | 01 | 1 | GEN-05, GEN-06 | unit | `cd services/agent && pnpm test` | ⬜ pending |
| 13-01-04 | 01 | 1 | GEN-07, GEN-08 | integration | `cd services/agent && pnpm test` | ⬜ pending |
| 13-02-01 | 02 | 2 | INFRA-01 | manual | Edge router curl test | ⬜ pending |
| 13-02-02 | 02 | 2 | INFRA-02 | manual | `cd infrastructure/pulumi && pulumi preview` | ⬜ pending |
| 13-02-03 | 02 | 2 | INFRA-03 | config | Check DO env vars | ⬜ pending |
| 13-02-04 | 02 | 2 | INFRA-04 | config | Anthropic console check | ⬜ pending |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE through CF edge router | GEN-07 | Requires deployed infrastructure | Deploy and curl with `--no-buffer` |
| Prompt cache hit | GEN-05 | Requires live Anthropic API | Send two identical requests, check logs for `cache_read_input_tokens > 0` |
| Spend cap | INFRA-04 | Anthropic console UI | Verify hard limit set in console |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or documented manual procedure
- [ ] Wave 0 covers test infrastructure gaps
- [ ] Feedback latency < 20s

**Approval:** pending
