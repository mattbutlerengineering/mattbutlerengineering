---
date: 2026-04-25
session: ACMM improvement loop iteration 1
tags: [acmm, audit, debugging]
feeds_back_into: [.claude/skills/acmm-audit/SKILL.md]
---

# Trust live audit output, not hand-summarized state from earlier in the conversation

**Context:** Mid-session I told the user that ACMM L5 was blocked on
`acmm:session-summary` and `acmm:cross-session-knowledge`. The user accepted that
framing and moved on. Two iterations later, while improving the report, I ran
the audit fresh and saw the actual L5 blockers were `acmm:public-metrics` and
`acmm:reflection-log` — completely different criteria. The earlier two were L4
checks already counted, not L5 gaps.

**What I learned:** When recalling state from earlier conversation turns or
memory, what I "remember" can be a paraphrase that lost precision. For anything
the user will act on (e.g. "close these specific gaps"), re-run the source of
truth — `node scripts/acmm/audit.js` — instead of recalling the previous run's
summary. The cost is a 15ms script execution; the cost of being wrong is the
user closing the wrong issues.

**Action taken:** The new "Next steps" section at the top of `report.md`
(commit 76194ce) makes it impossible to scroll past the current next-level
gaps. Future me reads the report, not my own memory.
