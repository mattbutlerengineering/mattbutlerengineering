# Session Summary

> `.claude/session-summary.template.md` is the pristine template; `.claude/session-summary.md` is the live scratchpad, which starts as a copy of it.
> At session end `.claude/hooks/session-archive.sh` compares the two: byte-identical means nothing was written this session, so nothing is archived. Anything else is copied to `.claude/sessions/`.
> Rows left on their `_placeholder_` are fine — placeholders are not what the hook keys on (#5598).

## Session metadata

| Field      | Value                     |
| ---------- | ------------------------- |
| Date       | _YYYY-MM-DD_              |
| Session ID | _auto-populated_          |
| Duration   | _approximate_             |
| Model      | _e.g., claude-sonnet-4-6_ |
| Branch     | _e.g., feat/new-feature_  |

## What changed

_List files created, modified, or deleted. Group by purpose._

- **Created:** _list of new files_
- **Modified:** _list of changed files_
- **Deleted:** _list of removed files_

## What was tried

_Document approaches attempted, including ones that did not work. This prevents future sessions from re-treading failed paths._

1. _Approach 1: description and outcome_
2. _Approach 2: description and outcome_

## What was learned

_Key takeaways from this session. These feed into `.claude/reflections/` and `.claude/memory/`._

- _Lesson 1_
- _Lesson 2_

## Corrections received

_Any user corrections or hook failures during the session._

- _Correction 1: what was wrong and what was the fix_

## Decisions made

_Architecture, design, or process decisions with rationale._

- _Decision 1: chose X over Y because Z_

## Next steps

_What should the next session pick up? Include specific file paths, issue numbers, or branch names._

- [ ] _Next step 1_
- [ ] _Next step 2_

## Continuity notes

_Context that would be lost between sessions: environment state, partially completed work, known blockers, open questions for the user._

- _Note 1_
