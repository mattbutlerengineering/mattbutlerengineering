---
run: venue-availability
scale: feature
written: 2026-10-25
source: Owner goal "/autorun … do as much work as possible for this. don't wait on me for anything. #7493"
assumptions:
  - The Owner is away and gave no interview. Every answer below comes from the committed run artifacts (idea.md, prd.md, ux.md, architecture.md, breakdown.md) and from decisions the Owner recorded during Decompose and Implement.
  - Implement keeps one branch and PR per breakdown item off main, built by worktree workers, with no `ready` label (Owner decision, 2026-10-25).
  - Per-item implementation PRs are merged once a reviewer pass returns no fail or flag verdict and `CI Gate` is green. This is the Owner's standing merge policy; `tier:*` labels do not block it. Autorun's "a green PR waits for the Owner" rule is applied only to Ship's release action.
  - Release authorization was not given, so Ship prepares and stops (`outcome: prepared`). No deploy, publish or tag, and no run of the operator backfill against any real database.
  - No `operate:` section was given, so Operate does not run this invocation and the run stays active after Ship.
---

# Autorun brief: venue-availability (Phase 1)

## What and why

Phase 1 of deep, extensible availability configuration for small and large venues: time structure plus closures, with enforcement on every booking path. Problem, users, evidence, solution shape and risks are in `idea.md` and `prd.md`. This brief adds nothing to them.

## Scope

- In: PRD stories 1–35, mirrored as tracking issue #7493 and the breakdown's 38 items (M0–M6).
- Out: Phases 2–5 (holidays; inventory and pacing; policies; events and private dining). Each becomes a separate feature run that re-enters at Decompose.

## UX surface

Yes. `prd.md` records `ux: required`, and `ux.md` exists.

## Tracker

Already mirrored. #7493 lists every item, and `tracking-checkbox.yml` ticks a box when its child closes. Each PR body ends with `Closes #<item>` and `Part of #7493`.

## Release

No authorization was given, so prepare-and-stop applies. `release.md` must list the Owner-only steps:

- the `backfill-availability.ts` dry run, then `--apply`;
- the deploy.

## Operate

Not specified, so Operate does not run.

## Stop-and-surface

Stop and surface instead of choosing for:

- any irreversible or production action;
- any acceptance criterion that needs an Owner decision the artifacts give no default for.
