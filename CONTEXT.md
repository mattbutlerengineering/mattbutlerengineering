# CONTEXT.md — Domain Language

Shared vocabulary for this repo's automation. Terms live here once a design has
actually needed them — this is a working glossary, not an upfront taxonomy.
Architecture vocabulary (module, interface, depth, seam, adapter, leverage,
locality) is defined by the `/codebase-design` skill and is deliberately not
duplicated here.

---

## Continuous-improvement loop

### Ephemeral checkout

The throwaway clone a scheduled routine runs in. A RemoteTrigger on claude.ai
clones the repo, runs its prompt, and discards the tree. Nothing written during
the run survives unless it reaches `origin/main` through a pull request.

This is the single fact that shapes every term below. A routine cannot "remember"
by writing a file; it can only remember by **committing** one.

### Loop memory

The set of artifacts a routine reads from its own past runs. Regression
detection compares against the previous sensor report; threshold tuning reads
past verification outcomes; the audit narrative accumulates dated entries.

Loop memory is what distinguishes the loop from a cron job that recomputes the
same answer forever. Every arrow in ADR-018 that reads backwards in time
(`detect`, `self-tune`) depends on it.

### Durable metric

A metric whose file **must** survive an ephemeral checkout, and is therefore
git-tracked on purpose.

Durability is a property of the metric, not of its path — it is declared once in
the `METRICS` registry (`scripts/metrics-store.mjs`) via `durable: true`, and
everything that needs to know derives from there: the generated `.gitignore`
block, the staging list used to open the metrics PR, and the drift test.

Contrast with an **ephemeral metric** — recomputed from scratch each run, safe to
leave untracked. `metrics/sensor-report.json` is ephemeral (a latest-only
snapshot); `metrics/sensor-report.jsonl` is durable (one appended line per run,
which is the part detection reads).

### Durable manifest

The full list of paths that must survive an ephemeral checkout. Formed by joining
three declarations, so that no path's durability is asserted in two places:

| source            | covers                                                    |
| ----------------- | --------------------------------------------------------- |
| `METRICS.durable` | metrics this repo's loop owns, inside `metrics/`          |
| `DURABLE_OUTSIDE` | durable artifacts outside `metrics/`, each with a reason  |
| `EXTERNAL`        | files inside `metrics/` owned by another tree, with owner |

A drift test asserts the generated `.gitignore` block equals the manifest, and
that every durable path is genuinely tracked by git. The second assertion is the
load-bearing one: a path can be declared durable, appear in the block, and still
never have been committed.

### Severed arrow

A loop arrow whose code is fully wired but which cannot carry information,
because the state it reads is unreachable at runtime. Distinct from an
unimplemented arrow: nothing is missing, and every test passes.

The canonical instance: `verify-fixes.mjs` writes verification outcomes and calls
the threshold tuner, which reads them back — but the file was gitignored, so
every ephemeral checkout read an empty file and the tuner logged
`No verification data — skipping tuning` and returned. Three consecutive audit
entries recorded the file "still doesn't exist" while it sat on a laptop.

Severed arrows report healthy. That is their defining hazard.

### Silent-branch fall-through

The recurring defect shape behind most severed arrows here: an unhandled case
lands in the **act** branch instead of the **abstain** branch, in code no test
reaches. Seen in an unhandled issue label reopening issues it should skip, in a
workflow's `git add` silently discarding an ignored file, and in a hook exiting
`0` on a path it never examined.

When adding a case-analysis over a registry-owned set (labels, sensors, zones),
derive the cases from the registry rather than restating them, and make the
fall-through abstain.
