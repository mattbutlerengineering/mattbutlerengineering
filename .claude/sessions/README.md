# Sessions Directory

This directory stores archived session summaries. Each file captures what happened during a single Claude Code session: what changed, what was learned, what failed, and what should happen next.

## Naming convention

```
YYYY-MM-DD-<descriptive-slug>.md
```

Illustrative examples (none of these are real files here):

- `2026-05-01-acmm-learning-infra.md`
- `2026-04-28-fix-undici-override.md`
- `2026-04-25-hospitality-sidebar-ship.md`

The slug should be short (3-5 words) and describe the primary task of the session. If a session covers multiple unrelated tasks, use the most significant one.

## How summaries are created

1. During a session, the agent uses `.claude/session-summary.md` as a working scratchpad. It starts as a copy of `.claude/session-summary.template.md`. Fill the `date:` field in its frontmatter with the session's real date — that is the only place anything machine-reads the date from (see "What reads these" below).
2. At session end, the `session-archive.sh` Stop hook compares the scratchpad against that template. Byte-identical means nothing was written this session, and the hook exits silently.
3. Anything else is copied here as `YYYY-MM-DD-HHMMSS.md` (UTC). Renaming it to the date-slug convention above is a manual step — the hook has no way to know the slug.
4. The hook does **not** reset the scratchpad, and nothing else does either. It instead skips any summary whose bytes already sit in this directory, so an unchanged scratchpad is archived once and never again. Resetting it by hand — `cp .claude/session-summary.template.md .claude/session-summary.md` — is what starts a clean next session.

Between #910 and #5598 none of this ran. The hook's guard grepped for the `_YYYY-MM-DD_` placeholder in a file that doubled as the template, so it matched on every run and the skip branch was taken unconditionally. `2026-05-12-acmm-gap-closure.md` is the one summary written in that window; #5598 archived it by hand, with the exact bytes the scratchpad had been holding since May.

## What reads these

One thing does, and it is worth being precise about, because the three bullets that used to sit here described loaders, aggregation and reflection synthesis that nothing implements (#5598):

- **ACMM substance checks.** `plugins/acmm/scripts/substance.js` reads `.claude/session-summary.md` for two criteria: `acmm:session-summary` (was a summary written, and within 90 days) and `acmm:session-continuity` (does the newest one carry forward context under "Next steps" / "Continuity notes"). Both read the date from **frontmatter only** — a date in the body does not count, because a later edit to an old summary is not a new one. Both report hollow today.

Nothing else reads this directory. Specifically, and each of these was measured rather than assumed:

- **No session-start loader exists.** The only `SessionStart` hook wired in `.claude/settings.json` is `session-log-rotate.sh`, which prunes `.claude/session-logs/*.json` — a different directory, holding the JSON transcripts `session-logger.sh` writes, not these summaries. Nothing loads the most recent summaries into a new session's context.
- **`/progress-tracker` does not aggregate summaries.** Its skill definition never mentions this directory or `session-summary.md`; it computes its metrics from GitHub and CI data.
- **Nothing synthesizes reflections from these.** Writing a `.claude/reflections/` entry by cross-referencing summaries against `.claude/memory/` is a thing a person can do by hand; no skill or script does it.

## Retention policy

There is none, and that is the whole of it: nothing prunes, tiers, or moves these files. No `sessions/archive/` directory exists and no code creates one. Files stay here until someone deletes them by hand.

(`.claude/session-logs/` — the JSON transcripts — _is_ rotated: `session-log-rotate.sh` deletes entries older than 90 days and caps the directory at 500 files. That mechanism has never applied to this directory.)

## Relationship to other systems

| System                     | Relationship                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.claude/memory/`          | Both are hand-written learning capture. Corrections are current; nothing links them to a summary automatically                                               |
| `.claude/reflections/`     | A reflection may be synthesized from one or more summaries, by hand. No tooling does this                                                                    |
| `.claude/session-logs/`    | JSON transcripts, written by `.claude/hooks/session-logger.sh` and rotated by `session-log-rotate.sh`. Unrelated to these summaries despite the similar name |
| `plugins/acmm/`            | Reads `.claude/session-summary.md`'s frontmatter date for `acmm:session-summary` and `acmm:session-continuity` (see above)                                   |
| `.claude/preferences.json` | Referenced by the ACMM catalog. Nothing in this repo writes it, and no summary has ever updated it                                                           |
| `.claude/task-log.jsonl`   | Five entries, all dated 2026-05-12, written by hand in the same session as the one summary above. Nothing appends to it; it is not fed by these summaries    |
