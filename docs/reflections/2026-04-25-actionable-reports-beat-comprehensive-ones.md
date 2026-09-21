---
date: 2026-04-25
session: ACMM improvement loop iteration 1
tags: [reports, ux, dx]
feeds_back_into: [plugins/acmm/scripts/outputs/report.js, plugins/acmm/skills/acmm-audit/SKILL.md]
---

# A comprehensive report nobody scrolls is worse than a 5-line "do these next" list

**Context:** `report.md` had a complete per-criterion breakdown — every L0
through L6 check, all 85 of them, with descriptions and detection patterns.
The "Next-level gaps" section existed but was buried below ~700 lines of
exhaustive detail. Reading the report end-to-end never happened in practice;
the user (and I) skimmed the level table at the top, then closed the file.

**What I learned:** Generated reports are read by people scanning for "what do
I do now," not auditing for completeness. The expensive thing to compute (full
per-criterion table) is the cheap thing to surface; the cheap thing to compute
(next-best-action with literal commands) is the expensive thing to surface.
Invert the layout: actionable items at the top, exhaustive detail below for
the rare audit case.

**Action taken:** Promoted next-level gaps to the top of `report.md` with
concrete `touch <file>` / `mkdir -p <dir>` hints derived from each
criterion's detection paths (commit 76194ce). Same data, different position
— but the difference between "scrolls past it" and "acts on it."

## Verification 2026-09-20 (monthly reflection review, #4876)

`feeds_back_into` paths corrected: the ACMM skill and its report writer were
extracted into the `plugins/acmm` plugin (#818), and these references were
never updated.

| was                                  | now                                       |
| ------------------------------------ | ----------------------------------------- |
| `.claude/skills/acmm-audit/SKILL.md` | `plugins/acmm/skills/acmm-audit/SKILL.md` |
| `scripts/acmm/outputs/report.js`     | `plugins/acmm/scripts/outputs/report.js`  |

The lessons themselves re-verified as still relevant. `scripts/check-memory-refs.mjs`
(added by this review) now fails on a dangling `feeds_back_into` so this class
of drift cannot sit unnoticed for five months again.
