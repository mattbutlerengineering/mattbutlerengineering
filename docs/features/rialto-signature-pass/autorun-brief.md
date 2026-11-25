# Autorun brief: rialto-signature-pass

Collected 2026-11-25 from Matt in session. Idea-stage inputs (problem, who,
why now, evidence, ambition rung, demo, step removed, riskiest piece and
spike, success sentence, unknowns) live in `idea.md`, which is committed and
is the source for those answers.

## Description

Audit every Rialto component and make it look better, be accessible, and feel
world-class and unique. The UI "lacks color and personality. its either very
light or very dark." Add a service-aware mode that adapts to live service
state. Record what Rialto does well and which components are missing.

## Scale

Feature run, slug `rialto-signature-pass`, run directory
`docs/features/rialto-signature-pass/`.

## Scope

In (Phase 1):

- A richer palette: mid-tone surfaces between the current light and dark
  extremes, and more accent roles beyond gold, passing the contrast tests.
- A full audit of all 103 components (accessibility, visual, interaction),
  re-checking the 48 findings in `packages/rialto/docs/ui-audit.md`.
- Fixes for every critical and serious accessibility finding.
- Service-aware mode built on the existing vibes presets, in the hospitality
  app.

Out (filed as GitHub issues, not built in this run):

- Visual restyle batches for components beyond what the palette change gives.
- New components (RadioGroup, Switch, Spinner, Toolbar, Listbox, TagsInput,
  FileUpload/Dropzone, VisuallyHidden).
- The Moonshot (per-venue identity), already seeded in `docs/backlog.md`.
- Cutting a Rialto npm release.

## Success criteria

From `idea.md`: every component has a current audit row with zero open
critical or serious accessibility findings; the hospitality app shifts with
live service state on its own; Matt, shown it beside two stock component
kits, calls it unmistakably Rialto (owner Matt, deadline set at PRD time).

## Constraints and decisions

- Brand: speakeasy, royal, gen-z through Rialto tokens, never at the cost of
  accessibility.
- Follow `packages/rialto/CLAUDE.md` and `.claude/rules/ui-quality.md`.
- Palette first; the first work item is the kill test (palette on Button,
  Input, Select, Card, Tabs, shown to Matt side by side).
- Service-aware mode must never move or resize interactive elements.
- Visual baselines regenerate only via `visual-baseline-regen.yml`.
- Rialto source changes need a changeset.

## Tracker

No existing issues seed the run. Deferred findings and out-of-scope items are
filed as GitHub issues.

## User-facing surface

Yes. The PRD records `ux: required`.

## Release authorization

Prepare and stop. No merge, deploy, tag or npm publish.

## Operate

- wait: 7 days
- minimum-signal: Matt's written uniqueness verdict plus a re-run audit

stop-after: decompose
