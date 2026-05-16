# ACMM Skeleton Audit (Issue #1072)

Audit of 105 detected criteria to distinguish "Skeletons" (docs-only) from "Functional Systems".

## Summary

| Level | Detected | Skeletons Identified | Functional Identified |
| ----- | -------- | -------------------- | --------------------- |
| L5    | 16       | 6                    | 10                    |
| L6    | 8        | 2                    | 6                     |

## Detailed Audit (L5/L6)

### Level 5

| Criterion                        | ID                            | Status        | Evidence                                                                     |
| -------------------------------- | ----------------------------- | ------------- | ---------------------------------------------------------------------------- |
| Accessibility checks for AI code | `acmm:accessibility-ai-check` | 💀 Skeleton   | Doc exists but explicitly states Phase 1 (awareness only). No CI gating yet. |
| AI service fallback policy       | `acmm:ai-service-fallback`    | 💀 Skeleton   | Config exists but doc states implementation in `agent-core` is missing.      |
| Override analytics               | `acmm:override-analytics`     | 💀 Skeleton   | Taxonomy defined in doc but not implemented in tools.                        |
| Agent identity attestation       | `acmm:agent-attestation`      | 💀 Skeleton   | Metadata-based only; no dedicated bot or GPG signing yet.                    |
| Review burden tracking           | `acmm:review-burden`          | 💀 Skeleton   | Doc exists but tracking scripts/dashboard integration not found.             |
| AI compliance documentation      | `acmm:ai-compliance-doc`      | ✅ Functional | Comprehensive mapping exists; functional as documentation.                   |
| GitHub Actions AI integration    | `acmm:github-actions-ai`      | ✅ Functional | `claude.yml` workflow exists and is active.                                  |
| Policy as code                   | `acmm:policy-as-code`         | ✅ Functional | `.github/policies/` exists with machine-enforceable rules.                   |
| Reflection log                   | `acmm:reflection-log`         | ✅ Functional | `.claude/reflections/` exists and contains session logs.                     |
| Self-correction tracking         | `acmm:self-correction-metric` | ✅ Functional | `plugins/acmm/scripts/pr-outcomes.js` calculates these metrics.              |

### Level 6

| Criterion                  | ID                               | Status        | Evidence                                                                             |
| -------------------------- | -------------------------------- | ------------- | ------------------------------------------------------------------------------------ |
| Multi-repo orchestration   | `acmm:multi-repo-orchestration`  | 💀 Skeleton   | Doc exists but notes it as a "Future Automation".                                    |
| Automated rollback         | `acmm:auto-rollback`             | ✅ Functional | `.github/workflows/auto-rollback.yml` is implemented with complex logic.             |
| Rollback drill             | `acmm:rollback-drill`            | ✅ Functional | `plugins/acmm/scripts/rollback.js` and `.github/workflows/rollback-drill.yml` exist. |
| Automated issue generation | `acmm:auto-issue-gen`            | ✅ Functional | `.github/workflows/auto-generate-issues.yml` exists and runs.                        |
| Multi-agent orchestration  | `acmm:multi-agent-orchestration` | ✅ Functional | `scripts/orchestrate.mjs` exists.                                                    |
| Strategic dashboard        | `acmm:strategic-dashboard`       | ✅ Functional | `docs/autonomous-work-log.md` and `web/src/components/acmm/` exist.                  |

## Proposed Detection Improvements

To avoid false positives for "Skeleton" systems, the following criteria should move from `path` or `any-of` detection to more robust functional checks:

1. **`acmm:accessibility-ai-check`**: Search for `pnpm --dir packages/rialto vitest .* accessibility` in `.github/workflows/`.
2. **`acmm:ai-service-fallback`**: Search for circuit breaker or fallback logic in `packages/agent-core/`.
3. **`acmm:override-analytics`**: Search for taxonomy labels (`S`, `C`, `T`, `O`, `P`, `M`) in session reflections.
4. **`acmm:review-burden`**: Search for `gh pr list --search "reviewed-by:"` in any tracking scripts.
5. **`acmm:agent-attestation`**: Check if commits are signed or have a dedicated bot author.
