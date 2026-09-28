# ACMM — AI Codebase Maturity Model

How this repo measures and improves how AI-operable it is over time.

## What ACMM scores

ACMM is a 6-level rubric for how well a codebase is set up to be **driven by
AI agents** rather than just edited by them. It evaluates the **meta-properties**
of the repo — instructions, metrics, loops, gates, autonomy — not the
quality of the application code itself.

The catalog is ported from
[kubestellar/console](https://github.com/kubestellar/console/tree/main/web/src/lib/acmm/sources),
the reference implementation validated in [arXiv:2604.09388](https://arxiv.org/abs/2604.09388),
plus repo-invented extensions kept in a separate, **non-gating** `local:`
source. Only criteria that are (a) in the upstream catalog, (b) an explicit
evidence-backed local extension, or (c) this repo's own self-improvement
metrics may gate the published level — see
[Upstream parity](#upstream-parity-and-local-extensions) below.

| Source                                                                                          | Criteria | Gates the level?                                       |
| ----------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------ |
| [AI Codebase Maturity Model](https://arxiv.org/abs/2604.09388)                                  | 58       | Yes                                                    |
| [Fullsend](https://github.com/fullsend-ai/fullsend)                                             | 2        | No                                                     |
| [Agentic Engineering Framework](https://github.com/DimitriGeelen/agentic-engineering-framework) | 2        | No                                                     |
| [Claude Reflect](https://github.com/BayramAnnakov/claude-reflect)                               | 0        | No (every criterion was a duplicate of an `acmm:` one) |
| Local extensions (`docs/acmm/gaps.md`)                                                          | 16       | No — moved out of `acmm` by #5853                      |
| Meta self-improvement                                                                           | 6        | No (display-only; routed through `check()`)            |

Counts as of #5853 (2026-09-28) — run `node -e '...'` against
`plugins/acmm/scripts/sources/index.js`'s `SOURCES` export for the live
numbers; they drift as criteria are added, merged, or moved.

### Upstream parity and local extensions

`plugins/acmm/scripts/sources/upstream-parity.js` is the enforcement point:
its `findUpstreamParityIssues()` (exercised by
`plugins/acmm/scripts/__tests__/upstream-parity.test.js`) asserts two things
about `plugins/acmm/scripts/sources/upstream-snapshot.json` (a point-in-time
capture of every upstream id, level, and scannable flag):

1. Every upstream id still exists locally with the same level/scannable, **or**
   is listed in `DROPPED_UPSTREAM_IDS` with a reason (duplicates collapsed,
   dead targets removed).
2. Every gating `acmm`-source criterion **absent** from the upstream snapshot
   is one of the four ids in `LOCAL_GATING_EXTENSIONS` — evidence-backed local
   additions (`instruction-sync-gate`, `instruction-rot-detection`,
   `accessibility-ai-check`, `auto-rollback`) that earned gating status because
   they check a real, running mechanism in this repo, not just a file's
   existence.

Everything else repo-invented lives in the non-gating `local:` source
(`plugins/acmm/scripts/sources/local.js`) — visible in the headline count and
`--project` reports, but never part of the level threshold walk.

**Refreshing the snapshot** when upstream changes (replace `<sha>` with the
commit to snapshot against):

```bash
gh api "repos/kubestellar/console/contents/web/src/lib/acmm/sources/acmm.criteria.ts?ref=<sha>" --jq .content | base64 -d
gh api "repos/kubestellar/console/contents/web/src/lib/acmm/sources/fullsend.ts?ref=<sha>" --jq .content | base64 -d
gh api "repos/kubestellar/console/contents/web/src/lib/acmm/sources/agentic-engineering-framework.ts?ref=<sha>" --jq .content | base64 -d
gh api "repos/kubestellar/console/contents/web/src/lib/acmm/sources/claude-reflect.ts?ref=<sha>" --jq .content | base64 -d
```

then re-extract `{ id, level, scannable }` per criterion (`scannable` defaults
to `true` when the upstream object omits the field) into
`upstream-snapshot.json`, and re-run
`pnpm --dir plugins/acmm test -- upstream-parity` — a failure names exactly
which id needs a decision (port it, or add it to `DROPPED_UPSTREAM_IDS`).

## The 6 levels

| L   | Name                  | Role        | Characteristic                                        |
| --- | --------------------- | ----------- | ----------------------------------------------------- |
| 1   | Assisted / Ad Hoc     | Executor    | AI used opportunistically; no project-specific config |
| 2   | Instructed            | Rule-writer | AI receives project context through committed files   |
| 3   | Measured / Enforced   | Analyst     | Rules mechanically enforced; AI loop instrumented     |
| 4   | Adaptive / Structured | Governor    | Workflows are structured and environment-aware        |
| 5   | Semi-Automated        | Operator    | System detects + proposes; humans approve             |
| 6   | Fully Autonomous      | Strategist  | System acts; humans audit after the fact              |

L0 (Prerequisites) is a **soft indicator** — basic engineering hygiene (test
suite, CI/CD, contributing guide) — not part of the level threshold walk.

**Threshold rule:** each level needs **≥70% of its scannable criteria detected**
to advance. L2 is special — needs only 1 (it's a single OR-group of agent-instruction files).

## Where this repo currently is

The current level is shown in the README badge between the
`<!-- acmm:begin -->` / `<!-- acmm:end -->` markers, kept in sync by the
audit script.

Live state lives at `.claude/acmm/state.json` and the human-readable
scorecard at `.claude/acmm/report.md` (both gitignored — they're
locally-derived from the source tree).

## How the audit works

```bash
# Dry run — score the repo, write report, create nothing
node plugins/acmm/scripts/audit.js

# Score a specific sub-project (app or package)
node plugins/acmm/scripts/audit.js --project apps/marketing

# + create deduplicated GitHub issues for next-level gaps
node plugins/acmm/scripts/audit.js --apply

# + rewrite README badge between <!-- acmm:begin -->/<!-- acmm:end -->
node plugins/acmm/scripts/audit.js --badge

# Full run (what scheduled trigger calls)
node plugins/acmm/scripts/audit.js --apply --badge

# Print trend history only
node plugins/acmm/scripts/audit.js --trend
```

## Monorepo vs Package implementation

ACMM can be run at the root of the monorepo or scoped to a specific project using the `--project <path>` flag.

### Inheritance logic

Sub-projects can inherit global ACMM signals from the repo root (like CI/CD workflows or contributing guides) by configuring the `acmm` field in their `package.json`:

```json
{
  "name": "@mbe/marketing",
  "acmm": {
    "inherit": true
  }
}
```

When `inherit: true` is set:

1. The audit first checks the project directory for the criterion.
2. If not found locally, it checks if the criterion's detection patterns are part of the `globalPaths` allowlist.
3. If allowed, it checks the repo root for the signal.

**Local-only criteria:** Certain criteria (like `CLAUDE.md` instructions, `llms.txt`, or `AGENTS.md`) MUST be present locally in the project directory to be detected, even if inheritance is enabled. This ensures every project has its own local context for AI agents.

### Global Paths (Defaults)

By default, the following paths are considered global and can be inherited:

- `.github/` (Workflows, templates)
- `docs/` (Runbooks, maturity model docs)
- `plugins/acmm/scripts/` (Audit tools)
- `CONTRIBUTING.md`
- `package.json`, `pnpm-workspace.yaml`, `turbo.json` (Monorepo config)

## Internally:

1. Loads all criteria from `plugins/acmm/scripts/sources/{acmm,fullsend,agentic-engineering-framework,claude-reflect,local}.js` plus `meta-criteria.js`.
2. Runs detection on each:
   - `path` — single file or directory; trailing `/` requires a directory
   - `any-of` — array of paths; ANY match satisfies
   - `grep` — file exists AND contains a regex
   - `active` — file exists AND a recent successful workflow run is found on the default branch (`gh run list`); `detection.anyBranch: true` opts out, only valid for a workflow with no push/schedule trigger
   - `check` — delegates to `criterion.check(cwd, opts)` for composite conditions (grep AND active, a count threshold, a live `gh` query) that don't fit the other four types; `check().passed === null` means unverifiable, not a pass
3. Computes the level via threshold walk — **only `acmm`-source criteria at L2–L6 gate it**; `local`, `fullsend`, `agentic-engineering-framework`, `claude-reflect`, and `meta` never do (see [Upstream parity](#upstream-parity-and-local-extensions)).
4. Writes `.claude/acmm/state.json` (full computation) and `.claude/acmm/report.md` (scorecard).
5. With `--apply`, files GitHub issues only for **next-level gaps** — dedupes via `state.issuesCreated[criterionId]` so re-runs don't spam.
6. With `--badge`, rewrites the README shields.io badge in place.

The audit always shows a **"since last run" diff** at the top of both
the console output and `report.md`: level delta, count delta, and the
literal criterion IDs that flipped to detected or regressed. This is the
direct signal for "did this iteration of work move the needle."

## How we improve over time

A pattern emerged from running the continuous-improvement loop on this
repo: **each iteration produces one tooling improvement plus one honest
gap closure.** The tooling improvement compounds — the next iteration's
gap closure is easier to spot because the previous iteration sharpened
the signal.

This is a default rhythm, not a rule. When N small honest gaps all sit
behind a single level threshold (closing 3 of them produces no
observable system change, but closing the 4th promotes the level),
batching them in one iteration is correct — the iteration's coherence
comes from the level promotion, not from doing one thing at a time.
What never changes: each artifact must have real content satisfying
the criterion's underlying need, not just file-presence theater. See
[reflections/2026-04-25-batch-when-honest-and-coherent.md](./reflections/2026-04-25-batch-when-honest-and-coherent.md).

```mermaid
flowchart LR
    A([Run audit<br/>node plugins/acmm/scripts/audit.js]) --> B{--diff vs<br/>prior state}
    B -->|Level changed| C[Update README badge<br/>--badge]
    B -->|No change| D[Read missing-for-next-level]
    C --> D
    D --> E{Cheapest<br/>next-level gap?}
    E -->|File-presence with<br/>real content potential| F[Honest gap closure<br/>e.g. docs/ai-ops-runbook.md]
    E -->|Already cheap-pickings<br/>exhausted| G[Tooling improvement<br/>e.g. --diff mode, Next-Steps section]
    F --> H[Commit + push to main]
    G --> H
    H --> I[Append docs/reflections/<br/>YYYY-MM-DD-slug.md]
    I --> J[Daily 10am PT trigger:<br/>mbe-acmm-audit --apply --badge]
    J -.files issues for new gaps.-> K[Issues labeled acmm + ready]
    K -.picked up every 2h.-> L[mbe-issue-worker]
    L -.opens PR.-> A
    I --> A

    classDef shipped fill:#d4f4dd,stroke:#2d6a4f,color:#1b4332
    classDef signal fill:#cfe2ff,stroke:#1e3a8a,color:#1e3a8a
    classDef autonomy fill:#fff3cd,stroke:#7a5c00,color:#7a5c00
    class A,B,D signal
    class F,G,H,I shipped
    class J,K,L autonomy
```

Three colors map to the three layers: **blue** is the human/audit feedback
loop, **green** is the work shipped this iteration, **yellow** is the
autonomous catch-up loop that runs without you (scheduled trigger →
issue → agent → PR → next audit).

Concrete examples from the L3→L5 climb:

| Iteration                 | Tooling shipped                                                                                     | Gap closed                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Lead with Next-Steps      | Hoisted next-level gaps to top of `report.md` with concrete `touch <file>` / `mkdir -p <dir>` hints | (none — pure tooling)                                                    |
| Reflections as convention | Established `docs/reflections/` format with frontmatter for `feeds_back_into:`                      | `acmm:reflection-log` (L4 → L5 promotion)                                |
| --diff signal             | Auto-detected delta vs prior saved state in console + report                                        | `acmm:observability-runbook` (L6 0/6 → 1/6) via `docs/ai-ops-runbook.md` |

The principle: **never close a gap with empty-file theater.** A criterion
exists because the file or directory has a real purpose. If you can't
honestly write the content, the gap stays open. Reading the criterion's
`details:` field tells you the underlying need.

### Anti-pattern at each level

Each level has a documented anti-pattern that often appears just before
the next-level transition trigger fires. The audit surfaces these:

- **L4 anti-pattern:** Policy theater — auto-tuning thresholds without a human-readable explanation of why they changed.
- **L5 anti-pattern:** Alert fatigue — generating proposals no one reviews.
- **L6 transition trigger:** "I want the system to act on what it finds, not just propose."

If you notice the anti-pattern showing up, that's the cue to stop adding
features at the current level and start moving up.

## Scheduled audit

Runs daily at **10:00 AM PT** via the `mbe-acmm-audit` RemoteTrigger:

```
node plugins/acmm/scripts/audit.js --apply --badge
```

This:

1. Re-runs detection on every commit landed since the last run.
2. Files GitHub issues for any new next-level gaps (label `acmm`, label `ready`).
3. Updates the README badge if the level changed.

The agent-issue-worker (`mbe-issue-worker`, every 2h) then picks up the
`ready`-labeled gap issues and tries to close them.

## Reflection log

`docs/reflections/` is the committed record of lessons learned from
running the loop — one file per lesson with frontmatter declaring which
instruction file it `feeds_back_into:`. This is itself one of the L5
criteria (`acmm:reflection-log`); the convention is documented in
`docs/reflections/README.md`.

Reflections are not changelogs and not tutorials. They capture the
moments when "running the code told me something I didn't know from
reading the code." They feed back into instruction files (CLAUDE.md,
SKILL.md, etc.) so future sessions start smarter than the last one.

## Related artifacts

| Artifact                                                                                       | Purpose                                                                                |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `.claude/skills/acmm-audit/SKILL.md`                                                           | Slash-command interface (`/acmm-audit`)                                                |
| `plugins/acmm/scripts/audit.js`                                                                | The audit runner                                                                       |
| `plugins/acmm/scripts/sources/{acmm,fullsend,agentic-engineering-framework,claude-reflect}.js` | The gating-eligible catalog (upstream-ported, plus 4 evidence-backed local extensions) |
| `plugins/acmm/scripts/sources/local.js`                                                        | Non-gating repo-invented criteria (`docs/acmm/gaps.md`)                                |
| `plugins/acmm/scripts/sources/upstream-snapshot.json`                                          | Point-in-time upstream `{id, level, scannable}` capture for the parity check           |
| `plugins/acmm/scripts/sources/upstream-parity.js`                                              | `DROPPED_UPSTREAM_IDS`, `LOCAL_GATING_EXTENSIONS`, `findUpstreamParityIssues()`        |
| `plugins/acmm/scripts/computeLevel.js`                                                         | Threshold walk + missing-for-next-level computation                                    |
| `plugins/acmm/scripts/outputs/{report,badge,issues}.js`                                        | Output renderers                                                                       |
| `.claude/acmm/state.json`                                                                      | Last run state (gitignored, locally derived)                                           |
| `.claude/acmm/report.md`                                                                       | Scorecard (gitignored, locally derived)                                                |
| `metrics/pr-acceptance.json`                                                                   | PR-history backfill for trend analysis                                                 |
| `docs/reflections/`                                                                            | Lessons-learned committed log                                                          |
| `docs/ai-ops-runbook.md`                                                                       | How to debug/override the autonomous systems                                           |

## Adding a new criterion

**A criterion that gates the published level** must be either a port of a real
upstream criterion, or an evidence-backed local exception added to
`LOCAL_GATING_EXTENSIONS` (see [Upstream parity](#upstream-parity-and-local-extensions)) —
the bar for the latter is a criterion that checks a real, running mechanism in
this repo, not a file's existence:

1. Upstream: open an issue or PR at [kubestellar/console](https://github.com/kubestellar/console); once it lands, port it into the matching `plugins/acmm/scripts/sources/<source>.js` file and refresh `upstream-snapshot.json`.
2. Local exception: add the criterion to `plugins/acmm/scripts/sources/acmm.js`, add its id to `LOCAL_GATING_EXTENSIONS` in `upstream-parity.js`, and document why in the criterion's `details` field — `pnpm --dir plugins/acmm test` fails loudly (via `upstream-parity.test.js`) if you skip this step.

**A criterion that's just a useful local signal, not worth gating the level
over**, goes in `plugins/acmm/scripts/sources/local.js` instead — visible in
the headline count and `--project` reports, never part of the threshold walk.

For repo-specific quality gates that aren't part of ACMM at all, use the
existing systems: `/site-audit` for UX/perf, `/ci-monitor` for CI
health, ADRs in `docs/adr/` for architectural decisions.
