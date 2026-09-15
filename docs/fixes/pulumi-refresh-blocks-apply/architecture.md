---
stage: architect
run: maintenance:pulumi-refresh-blocks-apply
date: 2026-09-12
ux: skipped — maintenance run with no user-facing surface (no prd.md to quote)
assumptions:
  - "Soft gate: `prd.md` is absent by design — this is a maintenance run (protocol § Maintenance-run orientation) and `defect.md` (`re-entry: architect`) is the requirements source. No backfill interview was run; every `Done when` criterion in `defect.md` is traced to a component in § Components."
  - "`ux: skipped — maintenance run with no user-facing surface` is echoed in frontmatter without a `prd.md` `ux-reason:` to quote; the skill's echo rule assumes a PRD exists, and the closest honest reading for a workflow-only fix is recorded rather than left blank."
  - "`pulumi-preview.yml` gets the identical `exclude:` list (the brief's 'and, if the mechanism needs it, `pulumi-preview.yml` for parity'). Judged as needed, not optional: a preview dispatched from the run branch is the only pre-merge, read-only engine run available under deploy-via-CI-only, and without the exclusion it reproduces run 34425499302's `- 2 to delete` and answers a different question than the `up` that will apply. No user was present to confirm the reading."
  - "The first apply's three `~ update` rows (DO App ingress insert, edge-router content, gen provider transition) are treated as already-authorized deploy debt — #4565 and #5167 are merged on `main`, the `public-ingress-never-applied` run carried release authorization for the first two, and the user said `fix it` on 2026-09-12 — not as new blast radius needing a fresh stop-and-surface. The one reading that changes this: a preview from the run branch (or from `main` at Ship) showing any row beyond those three, or any `replace`/`delete` on a non-orphan resource, which is a stop."
  - "Which of the two human fixes will eventually retire the bypass (grant the four Auth0 scopes vs `pulumi state delete` the two records) is unknown. The removal record and the guard test are designed for either; the recommended orderings in § Bypass lifecycle were derived from the engine's own validation asymmetry (read in source at `v3.253.0`), not asked of the user."
  - "`date:` is 2026-09-12 (the orchestrator's run day, Pacific); every run ID and timestamp quoted below is UTC and the newest fall on 2026-09-13."
---

# Architecture: exclude two orphaned Auth0 state records so `pulumi-up.yml` applies again

Requirements source: `defect.md` (Capture, `re-entry: architect`). Read it for
the evidence; this artifact does not re-derive it. Everything measured here was
read-only: `gh api` GETs against `pulumi/actions` and `pulumi/pulumi` at the
exact pinned revisions, `gh run view` on runs already on record, and this
worktree at `351a99e2b` (== `origin/main`). No `pulumi`, `doctl`, Auth0, or
tracker mutation of any kind.

## Approach

Tell the engine, on both the `Pulumi Refresh` and `Pulumi Up` steps of
`.github/workflows/pulumi-up.yml`, to ignore exactly the two orphaned URNs —
via the `exclude:` input that the already-pinned `pulumi/actions@8e5e406f…`
(v7.0.0) forwards to the already-pinned CLI 3.253.0 as `--exclude <urn>` — and
mirror the same list onto `pulumi-preview.yml` so the read-only preview answers
the same plan question as the apply. Refresh then skips the two records it
cannot read (no provider call, no 403), and `up` generates no delete step for
them (so the `update:branding` 403 Capture flagged never fires); the 16 other
resources refresh and the queued three updates apply. The exclusion is a
bypass, not a fix: it is written next to the URNs with its removal condition,
mirrored by a new guard test that reads the real workflow files and fails if
the list drifts, widens, loses its mirror, loses its explanation, or coexists
with a program that re-declares the excluded resources. The shape was chosen
against two others — a softened refresh (`continue-on-error` in either form)
and a raw-CLI step — and against state surgery; each loses for a reason
recorded in § Decisions. Retiring the bypass is one human act plus one small
removal PR, and the engine itself makes a stale bypass fail loudly in the
state-delete case (§ Bypass lifecycle).

## Components

### Orphan exclusion (`.github/workflows/pulumi-up.yml`)

- Responsibility: the one list of URNs the engine must not touch during
  `refresh` (line 104 step) and `up` (line 123 step). Two literal URNs, one per
  line, in an `exclude:` block on each step's `with:`. Nothing else on the
  workflow changes: same action SHA, same `pulumi-version: 3.253.0`, same
  `stack-name`, `work-dir`, `cloud-url`, same `env:`.
- Collaborators: `pulumi/actions` (`config.ts` → `stack.refresh({...options})`
  / `stack.up({...options})`) → the bundled Automation API → CLI 3.253.0
  `--exclude`; read textually by the guard test.
- Deletion test: remove it and the defect is back (38 of the last 60 runs).

### Preview parity (`.github/workflows/pulumi-preview.yml`)

- Responsibility: keep the read-only instrument planning the same operation the
  apply will run. The single `Pulumi Preview (no apply, no refresh)` step (lines
  149–169) gets the identical `exclude:` block. Every read-only property the
  preview test pins is untouched: `workflow_dispatch` only, `command: preview`,
  `refresh: false`, `contents: read`, no mutating verb, own concurrency group.
- Collaborators: Verify (dispatches it from the run branch), Ship (may dispatch
  it from `main` before the apply), the guard test (asserts list parity).
- Deletion test: remove it and Verify has no engine-level evidence for the
  `up`-side exclusion before merge, and a preview from `main` keeps reporting
  `- 2 to delete` for an apply that will delete nothing — an instrument that
  answers a different question than the operation it exists to predict.

### Bypass guard (`scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs`, new)

- Responsibility: the invariants that make the bypass exact, scoped, mirrored,
  explained, and incompatible with a program that re-declares the excluded
  resources. Reads the two real workflow files and `infrastructure/pulumi/*.ts`
  textually (the `pulumi-cli-pin.test.mjs` / `pulumi-preview-workflow.test.mjs`
  precedent — no YAML parser in `scripts/`). Self-contained, so the removal PR
  deletes one file; the two existing guard tests stay untouched and must stay
  green (no new `pulumi/actions` step is added, so the pin test's
  `pulumi-version:`-count invariant is unaffected).
- Collaborators: CI's `test` job via `scripts/vitest.config.mjs`
  (`include: ["scripts/__tests__/**/*.test.mjs"]`, run by
  `pnpm --dir scripts test` and `turbo test:coverage`; `scripts/coverage` is one
  of the `ci.yml:502` coverage uploads — so it is inside `CI Gate`).
- Deletion test: remove it and the list can drift by one character, grow to
  cover a real resource, lose its preview mirror, lose its comment, or silently
  freeze a re-landed `auth0.Tenant`/`auth0.Branding` — none of which any other
  gate would notice.

### Removal record

- Responsibility: the condition for retiring the bypass and the recipe for
  doing it, kept where a future session will actually look. Canonical copy: a
  marker comment directly above each `exclude:` block (the guard asserts the
  marker is present in both files). Human-facing copy: `release.md`'s checklist
  (`defect.md` Done-when 4). Cross-session copy: a `docs/backlog.md` seed
  appended by Operate at run close (protocol § Seed backlog), plus a short
  `.claude/rules/gotchas.md` bullet under "Pulumi / R2 state backend" —
  Decompose decides whether the gotchas bullet is a work item of this run or of
  the removal PR.
- Collaborators: the human (Matt) who performs either fix; the future removal
  PR; the guard test.
- Deletion test: remove it and the bypass becomes permanent by forgetting — the
  `shipped ≠ run` class this repo has already paid for four times in one day.

## Data model

Not a data-bearing change; three pieces of state matter.

**The exclusion list.** Two URN literals, verbatim from the failing refresh logs
(run 34740922628 `--log-failed`, `sort -u` → exactly these, no others):

```
urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant
urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding
```

Owner: the `Pulumi Refresh` step's `exclude:` block in `pulumi-up.yml`. The
`Pulumi Up` step and the preview step carry copies; the invariant "all three
lists are equal, and equal to these two" is owned by the guard test, and the
consistency required is at-every-commit (CI), never eventual. Access patterns:
the engine reads the list at refresh (skip) and at up/preview (keep, never
delete); the guard reads it textually; the human reads it next to its comment.
Literals, not wildcards — `UrnTargets` (`pkg/resource/deploy/deployment.go:141-146`
at `v3.253.0`) keeps literals and globs separately and `checkTargets` validates
only `Literals()`, so a literal is the only form the engine will ever tell you
has gone stale (§ Bypass lifecycle).

**What stays in prod state while the bypass holds.** The two records — Tenant
`id=terraform-20260909170700212700000001`, Branding
`id=terraform-20260909170702645900000002`, provider `auth0 default_3_51_0` (from
preview 34425499302) — are carried forward untouched. Refresh never reads them
(`deployment_executor.go:728-731`: an excluded URN gets no `RefreshStep`), and
up/preview emit a `SameStep` for them (`step_generator.go:2366-2374`: a state
resource skipped by targets/excludes "would have become a SameStep" and is
replicated as one), so they appear in summaries as **unchanged**, not as
deletes. Nothing in this run writes them; only the human's fix does.

**The removal condition.** Text, owned by the marker comment; the copies in
`release.md` and the backlog seed are derived and must match it. Its exact
content is specified under § Bypass lifecycle.

## Interfaces & contracts

### `exclude:` input → CLI arguments (action → Automation API → `pulumi`)

- Input: a YAML block scalar on the step's `with:`, one URN per line. The action
  reads it with `getMultilineInput` (split on `\n`, drop empty, trim) and then
  `parseSemicolorToArray`, which — despite its name — splits each line on `,`
  (`src/libs/utils.ts` at `8e5e406f`). `config.ts` places the result in one
  `options` object that `main.ts` spreads into every command:
  `refresh: () => stack.refresh({ onOutput, ...config.options })`, same for
  `up`, `preview`, `destroy`.
- Output: the bundled Automation API (`dist/index.js`, blob
  `26b27cd48fd27831fca2a7881f712d131ad68e7d`, read with the file split on `;`)
  emits, for each entry, `args.push("--exclude", eURN)` inside `async up(opts)`
  (split-line 36797 → 36835), `async preview(opts)` (36999 → 37037) and
  `async refresh(opts)` (37210 → 37238). CLI 3.253.0 accepts it on all three:
  `refresh.go:415-419` ("Specify a resource URN to ignore. These resources will
  not be refreshed. … Wildcards (*, **) are also supported"), `up.go:778`.
- Failure modes: a comma inside a URN would split it into two garbage excludes
  (none of ours contains one; the guard's URN-shape regex forbids it); a
  `target:` alongside is a CLI error (`refresh.go:500`, `up.go:798/924`
  `MarkFlagsMutuallyExclusive("target","exclude")`; the guard forbids `target:`);
  a wildcard is never existence-checked (forbidden by the guard); a URN that is
  no longer in state makes **refresh bail** but is **silently ignored by
  up/preview** — the asymmetry § Bypass lifecycle is built on. Timeouts and
  retry semantics are the existing step's (`timeout-minutes: 45`; refresh is
  idempotent; a re-run after a cancelled `up` goes through the existing
  `Pulumi Cancel + Clear Pending Operations` preamble).

### `Pulumi Refresh (Sync state with cloud)` step

- Input: the 18 records in prod state; the two-URN exclusion; the same secrets
  as today.
- Output: 16 records refreshed (a `~`/`unchanged` row each), the two carried
  forward with no provider call, step `success`, `Pulumi Up` no longer skipped.
  `deployment_executor.go:694-731` (`refresh()`): `checkTargets(Excludes)`
  passes while both URNs exist in `prev.Resources`; each excluded URN is
  `continue`d before `NewRefreshStep`.
- Failure modes, and what the caller (Ship) sees:
  - a **403 on a non-orphan URN** → step failure, up skipped — the existing
    behaviour; it would be a new scope gap, not this defect (§ Gaps G-C);
  - **`one or more targets could not be found in the stack`** naming an orphan
    URN (`checkTargets`, `deployment_executor.go:54`) → the human has already
    deleted the state records; the bypass is dead weight and now a blocker —
    the only correct action is the removal PR, never re-adding anything;
  - **an error line naming an orphan URN with `Insufficient scope`** → the
    exclusion did not reach the engine at runtime, contradicting the evidence
    above → finding, one dispatch, stop-and-surface (§ Verification, S-fail-1).

### `Pulumi Up` step

- Input: the program on `main`, the just-refreshed state, the same exclusion.
- Output (expected on the first apply): `~ 3 updated` — the three rows named in
  § Blast radius — and `15 unchanged` (13 + the two orphans as `SameStep`s),
  **no `deleted`**, job `Deploy Infrastructure` = `success`. Engine path at
  `v3.253.0`: `GenerateDeletes(targets, excludes)` (`step_generator.go:2251`) →
  `determineForbiddenResourcesToDeleteFromExcludes` (`:2595`, "the set of
  resources that must _not_ be deleted in order to satisfy the `--exclude`
  list"; logs "Planner was asked not to delete/update") → `isTargeted(res)` is
  false for both → the `else` branch emits a `SameStep`.
- Failure modes, and what Ship does:
  - **tail failure naming an orphan URN** (a delete was attempted anyway) →
    GAP-2 falsified by a real run; record the exact lines as a finding; **do
    not re-dispatch, do not `state delete`**; surface to the human with both
    documented fixes;
  - **failure on the DO App update** (a DO deployment error; the App update is
    a full DO deployment on the provider's own timeout — the `customTimeouts`
    warning is expected) → the "if an apply half-lands" plan in
    `docs/fixes/public-ingress-never-applied/release.md` applies verbatim; at
    most one re-dispatch, only after `doctl apps list-deployments` (read-only)
    shows nothing in progress;
  - **cancelled by the concurrency group** (`pulumi-deploy-refs/heads/main`,
    `cancel-in-progress: true`, shared with `push` and the `Deploy Static Sites`
    `workflow_run` trigger) → the superseding run on the same `main` SHA is
    equivalent evidence; read that one, never dispatch while one is in flight.

### Preview from the run branch (Verify's instrument)

- Input: `gh workflow run pulumi-preview.yml --ref fix/pulumi-refresh-blocks-apply`
  (GitHub runs the branch's copy of a `workflow_dispatch` workflow that exists
  on the default branch — it does), gated on
  `git diff origin/main..HEAD -- infrastructure/pulumi/` being empty (it is, at
  capture) and on the serialization check from `docs/fixes/public-ingress-never-applied/release.md` step 1 being empty.
- Output: the `pulumi-preview` artifact (`preview.txt`) showing
  `~ 3 to update`, **no `- delete` line**, `15 unchanged`, and neither orphan
  URN inside any `-`/`~`/`+` row; the App row confined to `spec.ingress.rules`;
  the edge-router row on `content` with `originRoutes` occurrences ≥ 1 in the
  fingerprint; gen at most the provider transition.
- Failure modes: **`- 2 to delete` still present** → the exclusion did not
  reach the engine (plumbing or parse) → back to Implement, do not merge;
  **engine error mentioning `--exclude`** → contradicts the source evidence
  above → stop-and-surface; **`App: unchanged`** → the public-ingress defect's
  signature → stop. What this preview cannot show: the refresh-side exclusion
  (`refresh: false` is a pinned property; any refresh is a state write) — that
  half is proven only by the first post-merge run.

### Bypass guard (test)

- Input: `.github/workflows/pulumi-up.yml`, `.github/workflows/pulumi-preview.yml`,
  `infrastructure/pulumi/*.ts` — real files, textual parsing.
- Output: pass, or a failure that names the invariant. Asserts:
  1. `pulumi-up.yml`: the steps named `Pulumi Refresh (Sync state with cloud)`
     and `Pulumi Up` each carry an `exclude:` block whose non-empty trimmed lines
     are exactly the two URNs above (set equality, length 2, verbatim — no `*`,
     no quotes, no trailing characters).
  2. `pulumi-preview.yml`: its one `pulumi/actions` step carries the identical
     list (cross-file parity, the 4.1g pattern — reading both files is the
     point).
  3. No other step in either file carries `exclude:`; no non-comment line in
     either file sets `exclude-dependents:` to anything but `false`, carries
     `target:`, or carries `continue-on-error` in either form (a step key or a
     `with:` input) — the bypass is a scoped exclusion, never a blanket one.
  4. Every excluded URN matches
     `^urn:pulumi:prod::mbe-infrastructure::auth0:index/(tenant:Tenant|branding:Branding)::[A-Za-z0-9-]+$`
     — scoped to the prod stack and to exactly these two Auth0 resource types;
     excluding any other resource fails.
  5. The marker line `# TEMPORARY BYPASS — maintenance:pulumi-refresh-blocks-apply`
     appears in both files, and the comment names
     `docs/fixes/pulumi-refresh-blocks-apply/release.md` — the "why" and the
     recipe travel with the "what".
  6. No file under `infrastructure/pulumi/` contains `auth0.Tenant(` or
     `auth0.Branding(` while an `exclude:` exists — re-landing #4924 with the
     bypass in place would let `up --exclude` silently skip the re-declared
     resources (`isExcludedFromUpdate`, `step_generator.go:189`) and leave the
     stale records in state with a green run; this assertion turns that into a
     PR-time failure that says "retire the bypass first".
- Failure modes: none at runtime. Vacuity is the risk, covered by Verify
  demonstrating RED against `origin/main`'s files (the throwaway-worktree
  pattern from `docs/fixes/public-ingress-never-applied/verification.md`).
  Implementation note for the preview file: the existing read-only-bound test
  strips `#` lines before matching, so the marker comment is safe, but no
  **non-comment** line may contain `pulumi up`/`pulumi refresh`/etc.; the URN
  lines do not.

## Stack & dependencies

- `pulumi/actions@8e5e406f4007fca908480587cb9893c07090f58d` (v7.0.0) `exclude`
  input — already pinned; the input exists at that SHA (`action.yml`), and the
  bundle emits it for `refresh`, `up`, `preview`. No new dependency, no version
  change.
- Pulumi CLI 3.253.0 `--exclude` on `refresh` and `up` — already pinned;
  `--exclude` landed in 3.158.0 (CHANGELOG, per `defect.md`), verified present
  in source at the tag. No version change; the `Pin Pulumi CLI` step and its
  guard stay as they are.
- vitest through `scripts/vitest.config.mjs` — existing; the new test is picked
  up by its include glob.
- No YAML parser — textual parsing by precedent.
- `gh` CLI for Verify/Ship (local session; not available in Claude Code Remote —
  gotchas § Claude Code Remote).

## Decisions & alternatives

- **`exclude:` on both `refresh` and `up`** over **GitHub step-level
  `continue-on-error: true` on refresh** — lets `up` run, but `up` still plans
  `- delete` for both orphans (preview 34425499302) and the Branding delete
  needs `update:branding` (#4848), so the 403 moves to the `Pulumi Up` tail;
  it also paints a partial refresh green, which is exactly the "absence renders
  identically to fine" trap.
- **`exclude:`** over **the `pulumi/actions` `continue-on-error` input on
  refresh** (GAP-3, now answered from source) — the bundled Automation API's
  `async refresh(opts)` emits no `--continue-on-error` at all (only
  `up`/`destroy` do: split-lines 36878, 37531), and CLI 3.253.0's `refresh` has
  no such flag (`refresh.go:378-500`, full flag list); so the input is a silent
  no-op on refresh, and it does nothing for the `up`-side delete either way.
- **`exclude:` on `up` as well, not only on refresh** — a refresh-only
  exclusion leaves `up` planning the two deletes; the `up`-side list is what
  turns them into `SameStep`s (`GenerateDeletes` path above). Same list on
  both, guarded equal.
- **The action input** over **a raw `run: pulumi refresh --exclude …` step** —
  precedent exists (`Pin Pulumi CLI`, `Pulumi Cancel + Clear Pending
Operations`), but a raw step would duplicate the nine-line `env:` block and
  the login, lose the action's captured `output`, and add a `pulumi` consumer
  the pin test's ordering assertion does not know by name; the input is a
  three-line diff per step with the same engine behaviour.
- **Literal URNs** over **wildcards** (`auth0:index/tenant:Tenant::*`) —
  `checkTargets` validates `Literals()` only, so a literal makes a stale bypass
  fail loudly after `state delete` while a wildcard rots silently; wildcard
  handling for `--exclude` also needed a fix as late as 3.188.0 (CHANGELOG).
- **`exclude-dependents` left at its default `false`** — the orphans have no
  dependents; setting it widens the bypass shape for nothing, and the guard
  forbids it.
- **Preview parity on the `exclude:` list only** over **extending the existing
  4.1g parity test to whole `with:` blocks** — the blocks legitimately differ
  (`command`, `diff`, `refresh: false`); whole-block parity would fail by
  design. Parity is asserted on the list, in the new file, so the removal PR
  deletes one file and touches neither existing test.
- **A new guard file** over **new cases in `pulumi-cli-pin.test.mjs`** — the
  bypass and its guard must leave together; the pin is permanent.
- **Not** state surgery inside the existing `stack export | python3 | stack
import` preamble (it could drop the two records) — out of scope by the brief
  ("Pulumi state surgery" is the human's), and it would be a permanent, silent
  state-deletion mechanism with no audit trail. Capture already ruled it out;
  recorded so no later stage rediscovers it.
- **Not** `target:` (apply only the three changed resources) — mutually
  exclusive with `exclude` on the CLI and needs maintenance per change.
- **Not** dropping the refresh step — refresh is the pipeline's drift
  detection; the public-ingress run's entire defect class was silent
  no-honour, and removing refresh redesigns the deploy pipeline well beyond
  the defect.
- **One dispatch for the first apply, no retry loop** — a tail failure on the
  orphans is a finding about GAP-2, not a flake; the only bounded retry is the
  DO half-landed case, and only after `list-deployments` is quiet.
- **No ADR** — see § ADRs.

## Bypass lifecycle (removal condition)

**Condition — remove when EITHER:**

- (a) the Pulumi M2M application's Management API grant carries
  `read:tenant_settings`, `update:tenant_settings`, `read:branding`,
  `update:branding` (#4848 option 1); or
- (b) both URNs are deleted from prod state after a `pulumi stack export`
  backup (#4848 option 2).

Both are the human's; the exact commands are already written in
`docs/fixes/public-ingress-never-applied/release.md` step 0 — `release.md` for
this run copies them, never re-derives them.

**What removal is:** one PR that deletes
`scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs` and removes the
three `exclude:` blocks with their marker comments. Nothing else. The pin and
preview tests are unchanged before and after.

**Where the condition is recorded** (canonical first): the marker comment above
each `exclude:` block; `release.md` § human checklist; a `docs/backlog.md` seed
at Operate close; optionally a gotchas bullet. Marker comment content (wording
is Implement's; the guard pins the first line and the run-directory reference):

```yaml
# TEMPORARY BYPASS — maintenance:pulumi-refresh-blocks-apply (Refs #5169, #4848)
# Two Auth0 records were left in prod state by #4924 (applied 2026-09-09T17:05Z,
# 403 on update:*) and orphaned by revert #5165; the Pulumi M2M grant lacks
# read:tenant_settings / read:branding, so refreshing them 403s and blocks every
# apply. Excluding them here, on `Pulumi Up`, and in pulumi-preview.yml is a
# bypass, not a fix. REMOVE all three blocks and
# scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs when EITHER
#   (a) the M2M grant carries read/update:tenant_settings + read/update:branding, OR
#   (b) both URNs below are deleted from prod state.
# Recipe and ordering: docs/fixes/pulumi-refresh-blocks-apply/release.md
exclude: |
  urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant
  urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding
```

**Ordering, derived from the engine's validation asymmetry** (refresh bails on
a missing literal exclude; up/preview ignore it; and `pulumi-up.yml`'s push
filter does not include `.github/workflows/**`, so merging the removal PR fires
no run by itself):

- Option (b), state delete: **merge the removal PR first, then `state delete`,
  then `gh workflow run pulumi-up.yml --ref main`.** In that order there is no
  red run at all; the only exposure is a `Deploy Static Sites` completion
  between the merge and the delete, which would fail with the old, harmless 403. The reverse order (delete first) turns the bypass into a loud blocker —
  `one or more targets could not be found in the stack` — until the PR merges.
- Option (a), scopes granted: **grant, then merge the removal PR, then
  dispatch.** The next `up` deletes both records: Tenant delete is a provider
  no-op; Branding delete resets universal-login branding to defaults, which per
  #4848 is what production shows today. Until the removal PR merges the bypass
  is harmless dead weight — refresh keeps skipping the two records and `up`
  keeps carrying them.

**Signals that the bypass is dead weight or harmful:**

- Loud, from the pipeline: (b) happened before removal → refresh fails naming
  the URN (see contract above). The fix is the removal PR; never re-add.
- Loud, at PR time: someone re-declares `auth0.Tenant`/`auth0.Branding` in the
  program while the bypass exists → guard assertion 6 fails.
- **Silent, by construction:** (a) happened and nobody opened the removal PR.
  No pipeline signal exists for a scope grant — the excluded resources are
  never touched. The `release.md` checklist, the backlog seed and the gotchas
  bullet are the only mitigations, and this is recorded as the known
  limitation rather than papered over with a probe this run does not need.

## Verification path (no local Pulumi) and Ship evidence

Hard constraint: no local `pulumi` of any kind; the only production apply is
`pulumi-up.yml` on `main`.

**Verify can collect, pre-merge:**

- V1. Guard test green on the branch (`pnpm --dir scripts test`), and
  demonstrably non-vacuous: the same test against `origin/main`'s workflow
  files fails assertions 1, 2 and 5 (RED) — run in a throwaway worktree, never
  by editing this tree.
- V2. `pulumi-cli-pin.test.mjs` and `pulumi-preview-workflow.test.mjs` still
  green (no new action step; no relaxed preview property).
- V3. `git diff origin/main..HEAD -- infrastructure/pulumi/` empty (the brief's
  precondition for touching the engine from a branch).
- V4. One dispatched preview from the run branch (read-only, authorized by the
  brief), read per the contract above: no `- delete`, `~ 3 to update`,
  `15 unchanged`, App row confined to `spec.ingress.rules`, fingerprint
  `originRoutes` ≥ 1, gen at most the provider transition. This is the first
  real-engine demonstration of the `up`-side exclusion at the pinned CLI
  (preview and up share `GenerateDeletes`) — and, incidentally, the runtime
  check that the two-URN block scalar parsed intact, since a mangled URN is
  silently ignored by preview and the deletes would simply still be there.
- V5. **Cannot be verified pre-merge, by design:** the refresh-side exclusion.
  Record it as "not verified — any refresh writes state; proven by the first
  post-merge run", not as a pass.

**Ship must read, post-merge** (the push filter does not fire for a
workflow-only merge, so the apply is `gh workflow run pulumi-up.yml --ref main`):

- S0. Pre-dispatch: `origin/main` HEAD recorded; serialization check exactly as
  `docs/fixes/public-ingress-never-applied/release.md` step 1, **plus
  `deploy-static.yml`** — a static deploy completing during the ~30-minute DO
  deployment fires the `workflow_run` trigger and `cancel-in-progress: true`
  cancels the apply mid-`up`; `doctl apps list-deployments 5dbdcf45-4053-4518-a97b-f1e2b3122a61 | head -3`
  (read-only) shows nothing in progress. Optionally one preview from `main`
  (fast, read-only) to confirm the plan on the exact merge SHA.
- S1. Exactly one dispatch; capture the run via
  `gh run list --workflow pulumi-up.yml --branch main --limit 1 --json databaseId,headSha,event,status`
  with `event == workflow_dispatch` and `headSha == origin/main`.
- S2. **Job-level** conclusion:
  `gh run view <id> --json jobs --jq '.jobs[]|select(.name=="Deploy Infrastructure")|{conclusion,steps:[.steps[]|"\(.name)=\(.conclusion)"]}'`
  — `Deploy Infrastructure` = `success`, `Pulumi Refresh (Sync state with
cloud)` = `success`, `Pulumi Up` = `success`. Never the workflow rollup (a
  skipped job reports workflow `success`; `Report Deploy Health` is
  `if: always()`).
- S3. Refresh log: the two URNs appear in **zero** error lines
  (`grep -E 'urn:pulumi.*auth0:index/(tenant|branding)' | grep -ci 'error\|forbidden'` → 0);
  the refresh `Resources:` summary quoted (expect `16 unchanged`, or `~ N
updated` if live drift was found — quote it either way).
- S4. Up log: the `Resources:` line quoted — expect `~ 3 updated`, `15
unchanged`, and **no `deleted`**; every `~` row named; neither orphan URN in
  a `-` row.
- S5. Deploy debt drained, read-only:
  `doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format yaml | grep -c /public` → `1`;
  the ingress order (`… /api -> reservations-api, /public -> reservations-api, / -> users-api`);
  the four `curl` probes and the no-`--base`
  `node scripts/check-api-surface-invariants.mjs` from the public-ingress
  release step 4 (the discriminator is the body: `Venue not found`, not
  `Route GET:… not found`). If `doctl` is unavailable, quote the run's own
  `~ updated` rows instead (`defect.md` Done-when 2).
- S6. DO deployment landed, not merely serving: `doctl apps list-deployments`
  phase `ACTIVE` for the new deployment, and `/api/v1/users/health` (the DB
  probe, not `/health`) — "prod health 200 ≠ deploy succeeded".
- S7. `Report Deploy Health` wrote `deploy/infrastructure` = `success` (its
  input is `needs.deploy.result`).
- S-fail-1 / S-fail-2 / S-fail-3: the three refresh/up failure branches in
  § Interfaces, each ending in a recorded finding and a stop, never a retry
  loop and never `pulumi state delete`.

## Blast radius of the first apply

Preview 34425499302 (2026-09-10T01:26:45Z, `main` @ `6524f6aae`, no refresh)
planned `~ 3 to update, - 2 to delete, 5 changes. 13 unchanged`. With the two
deletes excluded, the three updates are what applies (`gh run view
34425499302 --log`, rows quoted from the transcript):

1. `digitalocean:index/app:App::mattbutlerengineering-api-app`
   (`id=5dbdcf45-4053-4518-a97b-f1e2b3122a61`) — `spec.ingress.rules[6]`
   `component.name "users-api" => "reservations-api"`,
   `match.path.prefix "/" => "/public"`; `+ rules[7]` `users-api`, `"/"`,
   `preservePathPrefix: true`. Read as a list: one `/public → reservations-api`
   rule inserted before the `/` catch-all; nothing on `spec.services` / `jobs`
   / `features` (still under `ignoreChanges`). **Risk: medium** — the only row
   with a production-wide effect: a DO spec update runs as a full App Platform
   deployment (all three services redeploy from their current images, ~30 min,
   no image or migration change), which is why S0 serializes against
   `deploy-services.yml` (the dual-deploy race in gotchas) and S6 reads the
   deployment phase. It is also precisely #4565's deploy debt, reviewed and
   verified as prepared by the public-ingress run. Not a new stop.
2. `cloudflare:index/workersScript:WorkersScript::mattbutlerengineering-edge-router`
   — `content` diff (`{ pattern: "/public/", … }` rate-limit entry,
   `originRoutes: ["/api", "/public"]`, `isOriginRoute()`, the branch switch),
   plus provider `default_6_19_0 => default_6_20_0`. **Risk: low–medium** — an
   atomic worker swap in seconds that opens the edge gate for `/public/*` to
   the DO origin; 264 worker tests and the public-ingress review cover it;
   rollback is R1 in that run's release plan (a revert PR through CI). Not a
   new stop.
3. `cloudflare:index/workersScript:WorkersScript::mattbutlerengineering-gen`
   — provider transition only (`default_6_19_0 => default_6_20_0::[unknown]`,
   #5167's `@pulumi/cloudflare` `^6.19.0 → ^6.20.0`), every property printed
   without a `~`/`+`/`-` marker. **Risk: low** — expected to re-send identical
   inputs under the new provider; the public-ingress release already said
   "stop if the apply log shows an `assets` diff on it", carried here as a
   finding to record (an apply cannot be stopped mid-flight).

None of the three warrants a stop-and-surface before Ship under the fourth
assumption. Two things would: a branch/main preview showing a row beyond these
three, or any `replace`/`delete` on a non-orphan resource. One caveat is
inherent to the existing pipeline, not introduced here: refresh will now
succeed on 16 resources for the first time since 2026-09-09, so live drift the
no-refresh preview cannot see may add rows at apply time — Ship reads the
actual `~` rows (S4), never assumes the preview's three.

GAP-2 is narrower than Capture left it but not closed: the engine source at the
pinned tag says an excluded in-state, not-in-program resource becomes a
`SameStep`, and V4 will show it in a real preview; only the apply executes the
plan. The design above makes a tail failure on the orphans a recorded finding
with a single dispatch, never a retry target and never a reason to touch state.

## Gaps and open questions (stop-and-surface; none block Decompose)

- **G-A — GAP-2, narrowed, not closed.** `up --exclude` on an in-state,
  not-in-program resource: evidenced in source (`GenerateDeletes` →
  `determineForbiddenResourcesToDeleteFromExcludes` → `SameStep`) and to be
  demonstrated by V4's preview; executed only by the first apply. Carried to
  Ship as failure branch S-fail-3. Not blocking.
- **G-B — GAP-3, closed by evidence.** CLI 3.253.0 `refresh` has no
  `--continue-on-error` (`refresh.go:378-500`), and the action's bundled
  Automation API never emits it for `refresh`; the input would be a silent
  no-op. Recorded in § Decisions; nothing for Decompose.
- **G-C — GAP-1, unchanged.** The M2M grant's actual scope list is
  unmeasurable under the constraints; the design only relies on the provider's
  own 403 text and the absence of any other URN in the error lines. If the
  first refresh 403s on a _different_ URN, that is a new scope gap, not this
  defect. Not blocking.
- **G-D — bundled Automation API version unidentified.** `package-lock.json`
  is absent at `8e5e406f` and no `@pulumi/pulumi` version string was found in
  `dist/index.js`; the argument emission was read from the bundle itself,
  which is what runs, so this is provenance, not correctness. Not blocking.
- **G-E — removal timing is the human's.** Which fix, and when the removal PR
  merges relative to it, is Matt's decision; the two safe orderings are in
  § Bypass lifecycle. Nothing for Decompose beyond writing them into
  `release.md`.
- **G-F — drift rows at apply time.** Inherent to refresh-then-up; Ship quotes
  actual rows (S4). Not blocking.
- **G-G — concurrency during a ~30-minute apply.** `cancel-in-progress: true`
  on a group shared with the `Deploy Static Sites` `workflow_run` trigger can
  cancel the apply mid-`up`; S0 adds `deploy-static.yml` to the serialization
  check. Pre-existing hazard, not introduced here. Not blocking.

## Hand-off to Decompose

Next stage: **Decompose** (`breakdown.md`). No work items or checkboxes here;
what Decompose needs:

- Files touched: `.github/workflows/pulumi-up.yml` (two `exclude:` blocks +
  marker comments on the `Pulumi Refresh (Sync state with cloud)` and
  `Pulumi Up` steps); `.github/workflows/pulumi-preview.yml` (one `exclude:`
  block + marker on the preview step); new
  `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs` (assertions 1–6
  above, self-contained helpers by precedent); no change under
  `infrastructure/pulumi/**`; optionally one gotchas bullet.
- The two URNs, verbatim, from § Data model; the marker line, verbatim, from
  § Bypass lifecycle.
- Existing tests that must stay green: `pulumi-cli-pin.test.mjs`,
  `pulumi-preview-workflow.test.mjs`.
- Verify evidence list V1–V5 and the RED demonstration pattern; Ship evidence
  list S0–S7 and the three failure branches; the release checklist content
  (both human fixes copied from the public-ingress release step 0, the removal
  PR recipe, both orderings, the silent-limitation note).
- Tracker: `Refs #5169`, `Refs #4848` only — never `Closes`/`Fixes`; no issue
  or PR mutation until Ship merges this run's own PR.
- Standing constraints that bind every downstream stage: no local `pulumi`; no
  `state delete`/`stack import`; no Auth0 calls; one dispatch for the first
  apply; `metrics/ai-antipattern-baselines.json` untouched; never `status` as
  a shell variable.

## ADRs

none — no decision met the ADR bar. The mechanism choice is a real trade-off
and is surprising without context, but it is not hard to reverse: retiring it
is one small PR that deletes one test file and three YAML blocks, and the
context travels in the marker comment and this artifact. Recording it as an
ADR would give a deliberately temporary bypass the permanence of an
architecture decision.
