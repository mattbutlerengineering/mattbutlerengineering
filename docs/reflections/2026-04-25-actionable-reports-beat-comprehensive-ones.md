---
date: 2026-04-25
session: ACMM improvement loop iteration 1
tags: [reports, ux, dx]
feeds_back_into: [scripts/acmm/outputs/report.js, .claude/skills/acmm-audit/SKILL.md]
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
