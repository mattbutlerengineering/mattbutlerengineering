---
stage: decompose
run: maintenance:pulumi-refresh-blocks-apply
date: 2026-09-12
assumptions:
  - "Soft gate: `prd.md` is absent by design — this is a maintenance run (protocol § Maintenance-run orientation). `defect.md` (`re-entry: architect`) is the requirements source and `architecture.md` is the design. No backfill interview was run; every acceptance criterion below is derived from `defect.md`'s four Done-when criteria and `architecture.md`'s § Interfaces & contracts."
  - "No live cut review (skill step 4). Milestone boundaries and item sizing were decided by this stage from the brief and `architecture.md`, not by the user. Two milestones, nine items: M1 ends when the guard test that was RED on `origin/main`'s workflow files is GREEN on the edited ones; M2 ends when every gate the PR will face is green locally and the cross-session removal record exists. A workflow-only change with one new test file does not warrant more structure than that."
  - "Tracker: no mirror. The brief's tracker policy is read-only, and it says nothing about seeding from or exporting to the tracker, so per protocol § Tracker mirror no item carries a `(tracker: #NNN)` reference. #5169 and #4848 are cited as evidence only; the commit message carries `Refs #5169` and `Refs #4848`, never `Closes`/`Fixes`."
  - "The `.claude/rules/gotchas.md` bullet is a work item of THIS run (item 2.1), not of the future removal PR. `architecture.md` § Components (Removal record) left that choice to Decompose. Reasoning: the bullet exists to mitigate the one failure the architecture calls silent by construction — the scopes get granted and nobody opens the removal PR — and a record that ships inside the removal PR cannot mitigate forgetting the removal PR. CLAUDE.md's documented promotion path for gotchas (`/reflect`, `/gotcha-harvest`, human review in PR) is honoured in substance: the bullet lands through this run's reviewed PR, and the brief lists `docs for the bypass` as in scope."
  - "The `release.md` human checklist (both human fixes copied from `docs/fixes/public-ingress-never-applied/release.md` step 0, the removal-PR recipe, both removal orderings, the silent-limitation note, the `docs/backlog.md` line-128 reconciliation) is a Ship deliverable, not an Implement item — `defect.md` Done-when 4 names `release.md` as its carrier and `architecture.md`'s hand-off lists it under Ship evidence. It is carried below under § Carried forward so Ship does not re-derive it."
  - "`docs/backlog.md` line 128 is NOT claimed by this run. The brief says the run's origin is the user's instruction and `Do not claim a docs/backlog.md line`; the orchestrator's `backlog reconcile` is read as: `release.md` states how that seed relates to this run (partially answered by the bypass, fully by the human fix) without appending `(claimed: …)`, and Operate appends the removal-condition seed at run close per protocol § Seed backlog."
  - "Marker-comment wording beyond the pinned first line and the `release.md` reference is Implement's; the text in `architecture.md` § Bypass lifecycle is taken as the default wording. The guard pins only the marker substring and the run-directory reference, so Implement may tighten the prose without touching the test."
  - "How the six guard assertions are split into `it()` blocks is Implement's; acceptance counts behaviours, not `it()`s. Two hard constraints from measured gates: every `it()` must contain an `expect(` (the pre-push AI-antipattern ratchet counts `noopTestAssertions` in `__tests__` files), and helpers are copied into the new file rather than imported from `pulumi-preview-workflow.test.mjs` (the removal PR must delete exactly one file)."
  - "Implement's own RED comes for free from TDD ordering — the test lands before the YAML edits and this worktree's workflow files are byte-identical to `origin/main` — and is recorded in § Notes. Verify's V1 re-demonstration in a throwaway worktree is separate and stays Verify's; Implement dispatches nothing and runs no `pulumi`."
  - "`date:` is 2026-09-12 (the orchestrator's run day, Pacific); run IDs and timestamps quoted from the upstream artifacts are UTC."
---

# Breakdown: exclude two orphaned Auth0 state records, guarded, so `pulumi-up.yml` applies again

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

Scope check, so this does not inflate: four files change — two workflows gain
`exclude:` blocks with a marker comment, one guard test is new, one gotchas
bullet is added. Nothing under `infrastructure/pulumi/**` changes. No stage of
this run runs `pulumi`, `doctl`, `wrangler`, `gh workflow run`, or any Auth0
call until Verify (one read-only preview dispatch) and Ship (one apply
dispatch on `main`). The human fixes (#4848 options 1 and 2) are never
executed by any stage.

## Contracts Implement copies verbatim

From `architecture.md` § Data model and § Bypass lifecycle. Do not re-derive
or retype these from the brief — the brief's URNs were confirmed against real
logs by Capture (`defect.md` § The orphaned URNs); these are the confirmed
strings.

The exclusion list (both lines, exactly, no quotes, no wildcards):

```
urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant
urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding
```

The marker substring the guard pins (must appear on a comment line directly
above each `exclude:` block, in both files):

```
# TEMPORARY BYPASS — maintenance:pulumi-refresh-blocks-apply
```

The URN shape the guard enforces on every excluded line:

```
^urn:pulumi:prod::mbe-infrastructure::auth0:index/(tenant:Tenant|branding:Branding)::[A-Za-z0-9-]+$
```

The default comment text (wording is Implement's; the guard pins only the
marker substring and the `docs/fixes/pulumi-refresh-blocks-apply/release.md`
reference):

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

## How the new test is executed (measured, so it cannot be orphaned)

- `scripts` is a pnpm workspace package (`pnpm-workspace.yaml` lists
  `"scripts"`; `scripts/package.json` is `@mbe/scripts`) with
  `"test": "cd .. && vitest run --config scripts/vitest.config.mjs"` and a
  `test:coverage` variant.
- `scripts/vitest.config.mjs` has
  `include: ["scripts/__tests__/**/*.test.mjs"]`, so any new `*.test.mjs`
  under `scripts/__tests__/` is discovered with no registration step.
- Local, one file: `pnpm --dir scripts test pulumi-orphan-exclude-bypass`
  (vitest takes the trailing token as a filename filter). Local, whole suite:
  `pnpm --dir scripts test`. Root `pnpm test` (`turbo run test`) also visits
  `@mbe/scripts`.
- CI: `ci.yml`'s `test` job (`needs: [lint, typecheck, architecture-audit]`)
  runs `pnpm turbo test:coverage --concurrency=2` (line 488) and uploads
  `./scripts/coverage/coverage-final.json` (line 502); `test` is in
  `ci-gate`'s `needs` list (lines 815-832). The new test is therefore inside
  `CI Gate`, the only required status check on `main`.
- Orphan guard: `scripts/check-orphaned-tests.mjs` (in `pnpm repo-audit`)
  requires every `*.test.*` file to live under a workspace package that
  declares a `test` script; `scripts/` qualifies and `ALLOWLIST` stays `[]`.
- Lint: `scripts/package.json` declares `"lint": "eslint ."` and the root
  `eslint.config.js` covers `scripts/**` (with `no-console: off`), so
  `pnpm --dir scripts lint` and `turbo run lint` both see the file;
  lint-staged runs `eslint --fix` + `prettier --write` on staged `.mjs`.
  (`docs/backlog.md` line 58's claim that `scripts/` is unlinted is stale —
  the `lint` script exists on `origin/main`.)
- Pre-push: `.husky/pre-push` runs `node scripts/check-ai-antipatterns.mjs`
  (scans `.mjs` including `__tests__`; `noopTestAssertions` counts any
  `it()`/`test()` block without an `expect(`/`assert(` call) and the regen
  gate (`scripts/check-regen-needed.mjs` — a workflow + test + docs diff takes
  the fast path). Pre-commit runs lint-staged and `check-adr --staged`, which
  imports `@mbe/agent-core/dist` — hence the brief's
  `pnpm build --filter @mbe/cli...` before committing.
- Other readers of the two workflow files that must stay green, all under
  `scripts/`: `__tests__/pulumi-cli-pin.test.mjs` (counts `pulumi-version:`
  lines against `uses: pulumi/actions@` lines and orders the pin step before
  the named consumers), `__tests__/pulumi-preview-workflow.test.mjs` (pins the
  preview's read-only properties and build-input parity with `pulumi-up.yml`),
  and `pulumi-r2-validation-guard.mjs` + its test (parses the `s3://` bucket
  out of `pulumi-up.yml`'s `cloud-url`). None reads `exclude:`, none counts
  `with:` keys, and none is touched by this run.

## Milestone 1: the bypass exists and is guarded

Demonstrable at the boundary: `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs`
fails on `origin/main`'s two workflow files and passes on the edited ones;
`git diff --name-only origin/main..HEAD` outside `docs/` is exactly those
three files.

- [x] **1.0 Worktree ready** — install deps in the fresh worktree and prove the existing guards run here.
  - Accept: `pnpm install --frozen-lockfile` exits 0 in the worktree;
    `pnpm --dir scripts test pulumi-cli-pin` exits 0 (vitest resolves, the
    existing pin guard is green on the unedited files);
    `git diff origin/main --stat` prints nothing outside `docs/`.
  - Blocked by: —

- [x] **1.1 Guard test, RED first** — write `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs` covering all six invariants from `architecture.md` § Bypass guard, and watch it fail on the unedited workflows.
  - Accept: the file reads the real `.github/workflows/pulumi-up.yml`,
    `.github/workflows/pulumi-preview.yml`, and every `infrastructure/pulumi/*.ts`
    via `resolve(__dirname, "../..")`; imports only `vitest`, `node:fs`,
    `node:path`, `node:url` (no YAML parser — the `pulumi-cli-pin.test.mjs`
    precedent); step/comment helpers are copied in, not imported. It asserts:
    (1) in `pulumi-up.yml`, the steps named exactly
    `Pulumi Refresh (Sync state with cloud)` and `Pulumi Up` each carry an
    `exclude:` block whose non-empty trimmed lines are set-equal to the two
    URNs above, length 2, verbatim (no `*`, no quotes, no trailing characters);
    (2) `pulumi-preview.yml`'s single `pulumi/actions` step carries the
    identical list (cross-file parity); (3) no other step in either file
    carries `exclude:`, and no non-comment line in either file sets
    `exclude-dependents:` to anything but `false`, carries `target:`, or
    carries `continue-on-error` in either form (step key or `with:` input);
    (4) every excluded URN matches the shape regex above; (5) the marker
    substring appears on a comment line in both files and the comment names
    `docs/fixes/pulumi-refresh-blocks-apply/release.md`; (6) no
    `infrastructure/pulumi/*.ts` contains `auth0.Tenant(` or `auth0.Branding(`
    while any `exclude:` exists in `pulumi-up.yml`. Every `it()` contains an
    `expect(`. RED: with both workflow files still byte-identical to
    `origin/main`, `pnpm --dir scripts test pulumi-orphan-exclude-bypass`
    exits non-zero and the failures name at least invariants 1, 2 and 5 (3, 4
    and 6 pass vacuously on files with no `exclude:` — expected, not a test
    defect). Paste the RED summary line (`Tests N failed | M passed`) and
    `git rev-parse HEAD` into § Notes, dated.
  - Blocked by: 1.0

- [x] **1.2 `pulumi-up.yml`: exclusion + marker on both up-side steps** — add the marker comment block and `exclude: |` (two URN lines) to the `with:` mapping of `Pulumi Refresh (Sync state with cloud)` and of `Pulumi Up`.
  - Accept: both steps carry the block; the marker substring is on a comment
    line directly above each `exclude:`; the comment names
    `docs/fixes/pulumi-refresh-blocks-apply/release.md`;
    `git diff --numstat origin/main -- .github/workflows/pulumi-up.yml`
    reports 0 deletions (additions only) and the added lines are only comment
    lines and the two `exclude:` blocks — `uses:` SHA, `pulumi-version:
3.253.0`, `command:`, `stack-name:`, `work-dir:`, `cloud-url:` and every
    `env:` line are byte-identical to `origin/main`; no `exclude-dependents:`,
    `target:` or `continue-on-error` is introduced;
    `pnpm --dir scripts test pulumi-cli-pin` and
    `pnpm --dir scripts test pulumi-r2-validation-guard` still exit 0.
  - Blocked by: 1.1

- [x] **1.3 `pulumi-preview.yml`: identical exclusion + marker on the preview step** — add the same comment block and the same two-line `exclude: |` to the `with:` mapping of `Pulumi Preview (no apply, no refresh)`.
  - Accept: the `exclude:` lines are byte-identical to `pulumi-up.yml`'s;
    marker + `release.md` reference present;
    `git diff --numstat origin/main -- .github/workflows/pulumi-preview.yml`
    reports 0 deletions; `command: preview`, `diff: true`, `refresh: false`,
    `permissions: contents: read`, the `workflow_dispatch`-only trigger and
    the concurrency group are untouched;
    `pnpm --dir scripts test pulumi-preview-workflow` exits 0 with that test
    file byte-identical to `origin/main` (measured why it stays green: its
    `withoutComments()` strips the marker lines, its `command:`/`refresh:`
    filters match only lines starting with those keys, and its mutating-verb
    regexes all require whitespace after `pulumi` — the URN lines contain
    `urn:pulumi:prod`, so none matches).
  - Blocked by: 1.2

- [x] **1.4 Guard GREEN** — the same test now passes on the edited files.
  - Accept: `pnpm --dir scripts test pulumi-orphan-exclude-bypass` exits 0
    with every `it()` passing and none skipped; paste the GREEN summary line
    and `git rev-parse HEAD` into § Notes, dated, next to the RED line from
    1.1. `git diff --name-only origin/main..HEAD` outside `docs/` lists
    exactly `.github/workflows/pulumi-up.yml`,
    `.github/workflows/pulumi-preview.yml`,
    `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs`.
  - Blocked by: 1.3

## Milestone 2: the repo's gates agree and the removal record exists

Demonstrable at the boundary: every check the PR will face (`CI Gate`'s
`lint`/`test`/`repo-audit` subset that touches these files, plus the pre-push
ratchet) is green in the worktree; a future session reading
`.claude/rules/gotchas.md` learns the bypass exists, why, and when to remove
it, without opening this run directory.

- [x] **2.1 Gotchas bullet** — add one bullet to `.claude/rules/gotchas.md` under `## Pulumi / R2 state backend` (after the `pulumi-r2-checksum-validation.yml` bullet, before `## Dependencies`).
  - Accept: exactly one new bullet, in the section's existing bold-lead
    style, that names: the two orphan records (`auth0:index/tenant:Tenant
mattbutlerengineering-tenant`, `auth0:index/branding:Branding
mattbutlerengineering-branding`) and how they got there (#4924 applied
    2026-09-09T17:05Z with a 403 on `update:*`, orphaned by revert #5165);
    the three `exclude:` blocks (`pulumi-up.yml` refresh + up,
    `pulumi-preview.yml` preview) and
    `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs` as the guard;
    the removal condition — (a) M2M grant carries
    `read:tenant_settings`/`update:tenant_settings`/`read:branding`/`update:branding`,
    OR (b) both URNs deleted from prod state after a `stack export` backup;
    the two safe orderings in one line each (b: merge removal PR → `state
delete` → dispatch; a: grant → merge removal PR → dispatch); the
    silent-by-construction note (a scope grant produces no pipeline signal, so
    the removal PR must be opened by hand); and
    `docs/fixes/pulumi-refresh-blocks-apply/release.md` as the recipe. Cites
    #5169/#4848 as refs. No other line of the file changes
    (`git diff --numstat origin/main -- .claude/rules/gotchas.md` → 0
    deletions). `pnpm exec prettier --check .claude/rules/gotchas.md` passes.
  - Blocked by: 1.3

- [x] **2.2 Whole `scripts` suite green, existing guards untouched** — run the full `@mbe/scripts` test suite.
  - Accept: `pnpm --dir scripts test` exits 0;
    `git diff origin/main..HEAD --stat -- scripts/__tests__/pulumi-cli-pin.test.mjs scripts/__tests__/pulumi-preview-workflow.test.mjs scripts/__tests__/pulumi-r2-validation-guard.test.mjs scripts/pulumi-r2-validation-guard.mjs`
    prints nothing (the pin, preview and R2 guards are byte-identical to
    `origin/main` — the removal PR must be able to delete one file and touch
    neither existing test).
  - Blocked by: 1.4

- [x] **2.3 Lint, format, orphan and ratchet gates** — the checks CI and the hooks will run on these four files.
  - Accept, each exit 0 in the worktree: `pnpm --dir scripts lint`;
    `pnpm exec prettier --check .github/workflows/pulumi-up.yml .github/workflows/pulumi-preview.yml scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs .claude/rules/gotchas.md docs/fixes/pulumi-refresh-blocks-apply/`
    (the docs-only prettier trap in gotchas § CI — run docs are gated on the
    NEXT code PR, so format them now); `node scripts/check-orphaned-tests.mjs`
    with `ALLOWLIST` unchanged; `node scripts/check-ai-antipatterns.mjs`
    (no `--update`) with `metrics/ai-antipattern-baselines.json` byte-identical
    to `origin/main`; `node scripts/check-workflow-deps.mjs` and
    `node scripts/check-ci-dispatch.mjs` (the two workflow-reading fitness
    checks in `repo-audit`). Optional, if it runs in the worktree:
    `/local-ci-precheck`.
  - Blocked by: 2.1, 2.2

- [x] **2.4 Scope invariants and commit** — prove the change is exactly the designed shape, then commit on `fix/pulumi-refresh-blocks-apply`.
  - Accept: `git diff origin/main..HEAD -- infrastructure/pulumi/` prints
    nothing (the brief's precondition for Verify's branch preview);
    `git diff --name-only origin/main..HEAD` is exactly the four files above
    plus `docs/fixes/pulumi-refresh-blocks-apply/*`; `pnpm build --filter @mbe/cli...`
    was run before `git commit` (pre-commit `check-adr --staged` needs
    `@mbe/agent-core/dist`); files staged by explicit path, never `git add -A`;
    the commit message is Conventional Commits (`fix(ci): …` or `ci: …`),
    body cites `Refs #5169` and `Refs #4848` (never `Closes`/`Fixes`), and
    ends with the two trailers from the brief; § Notes records that no
    `pulumi`, `doctl`, `wrangler`, Auth0, `gh workflow run`, or tracker
    mutation was invoked during Implement. If a push is made, verify it by
    comparing `git rev-parse HEAD` with `git ls-remote origin fix/pulumi-refresh-blocks-apply`,
    never `git push | tail`.
  - Blocked by: 2.3

## Carried forward — not Implement items

Recorded here so Verify and Ship read one place. Names and numbering are
`architecture.md`'s (§ Verification path and Ship evidence, § Interfaces &
contracts); this stage adds nothing to them.

### Verify (pre-merge, on the run branch)

- **V1.** Guard test green (`pnpm --dir scripts test`), and demonstrably
  non-vacuous: the same test against `origin/main`'s workflow files fails
  invariants 1, 2 and 5 — run in a throwaway detached `git worktree` under the
  session scratchpad (the `docs/fixes/public-ingress-never-applied/verification.md`
  pattern: `node_modules` symlinked, removed with `git worktree remove --force`
  afterwards), never by editing this tree. Implement's own RED/GREEN lines in
  § Notes are corroboration, not a substitute.
- **V2.** `pulumi-cli-pin.test.mjs` and `pulumi-preview-workflow.test.mjs`
  still green, byte-identical to `origin/main`.
- **V3.** `git diff origin/main..HEAD -- infrastructure/pulumi/` empty.
- **V4.** Exactly one dispatched preview from the run branch —
  `gh workflow run pulumi-preview.yml --ref fix/pulumi-refresh-blocks-apply`
  (read-only; authorized by the brief) — gated on V3 and on the serialization
  check from `docs/fixes/public-ingress-never-applied/release.md` step 1 being
  empty. Read the `pulumi-preview` artifact (`preview.txt`) per the contract:
  **no `- delete` line**, `~ 3 to update`, `15 unchanged`, neither orphan URN
  inside any `-`/`~`/`+` row, the App row confined to `spec.ingress.rules`,
  edge-router row on `content` with `originRoutes` occurrences ≥ 1 in the
  fingerprint, gen at most the provider transition. This is the first
  real-engine demonstration of the `up`-side exclusion at the pinned CLI, and
  the runtime check that the block scalar parsed intact (a mangled URN is
  silently ignored by preview and the deletes would simply still be there).
  Failure readings: `- 2 to delete` still present → exclusion did not reach
  the engine → back to Implement, do not merge; engine error mentioning
  `--exclude` → contradicts the source evidence → stop-and-surface;
  `App: unchanged` → the public-ingress defect's signature → stop.
- **V5.** The refresh-side exclusion **cannot be verified pre-merge** — any
  refresh writes state and `pulumi-preview.yml` pins `refresh: false`. Record
  it as "not verified — proven by the first post-merge run", never as a pass.

### Ship (post-merge, on `main`)

The push filter does not include `.github/workflows/**`, so a workflow-only
merge fires no run by itself; the apply is one
`gh workflow run pulumi-up.yml --ref main`.

- **S0.** Pre-dispatch: record `origin/main` HEAD; serialization check exactly
  as `docs/fixes/public-ingress-never-applied/release.md` step 1 **plus
  `deploy-static.yml`** (a static deploy completing during the ~30-minute DO
  deployment fires the `workflow_run` trigger and `cancel-in-progress: true`
  cancels the apply mid-`up`);
  `doctl apps list-deployments 5dbdcf45-4053-4518-a97b-f1e2b3122a61 | head -3`
  (read-only) shows nothing in progress. Optionally one preview from `main`.
- **S1.** Exactly one dispatch; capture the run via
  `gh run list --workflow pulumi-up.yml --branch main --limit 1 --json databaseId,headSha,event,status`
  with `event == workflow_dispatch` and `headSha == origin/main`.
- **S2.** **Job-level** conclusion:
  `gh run view <id> --json jobs --jq '.jobs[]|select(.name=="Deploy Infrastructure")|{conclusion,steps:[.steps[]|"\(.name)=\(.conclusion)"]}'`
  — `Deploy Infrastructure` = `success`, `Pulumi Refresh (Sync state with cloud)`
  = `success`, `Pulumi Up` = `success`. Never the workflow rollup.
- **S3.** Refresh log: the two URNs appear in zero error lines
  (`grep -E 'urn:pulumi.*auth0:index/(tenant|branding)' | grep -ci 'error\|forbidden'`
  → 0); quote the refresh `Resources:` summary (expect `16 unchanged`, or
  `~ N updated` if live drift was found — quote it either way).
- **S4.** Up log: quote the `Resources:` line — expect `~ 3 updated`,
  `15 unchanged`, **no `deleted`**; name every `~` row; neither orphan URN in
  a `-` row.
- **S5.** Deploy debt drained, read-only:
  `doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format yaml | grep -c /public`
  → `1`; the ingress order (`… /api -> reservations-api, /public -> reservations-api, / -> users-api`);
  the four `curl` probes and the no-`--base`
  `node scripts/check-api-surface-invariants.mjs` from the public-ingress
  release step 4 (discriminator is the body: `Venue not found`, not
  `Route GET:… not found`). If `doctl` is unavailable, quote the run's own
  `~ updated` rows (`defect.md` Done-when 2).
- **S6.** DO deployment landed, not merely serving: `doctl apps list-deployments`
  phase `ACTIVE` for the new deployment, and `/api/v1/users/health` (the DB
  probe, not `/health`).
- **S7.** `Report Deploy Health` wrote `deploy/infrastructure` = `success`.
- **S-fail-1** (refresh error line naming an orphan URN with
  `Insufficient scope`): the exclusion did not reach the engine at runtime —
  finding, one dispatch, stop-and-surface. **S-fail-2**
  (`one or more targets could not be found in the stack` naming an orphan
  URN): the human already deleted the records; the bypass is now a blocker —
  the only correct action is the removal PR, never re-adding anything.
  **S-fail-3** (`Pulumi Up` tail failure naming an orphan URN): GAP-2
  falsified by a real run — record the exact lines, **do not re-dispatch, do
  not `state delete`**, surface with both documented fixes. A DO App update
  failure follows the public-ingress "if an apply half-lands" plan (at most one
  re-dispatch, only after `list-deployments` is quiet); a concurrency-group
  cancellation means the superseding run on the same SHA is the evidence.

### `release.md` content Ship owns (`defect.md` Done-when 4)

- Both human fixes, copied verbatim from
  `docs/fixes/public-ingress-never-applied/release.md` step 0 — option 2
  (`pulumi stack export … > state-backup-<date>.json`, then
  `pulumi state delete '<urn>' --stack organization/mbe-infrastructure/prod --yes`
  ×2, with its `jq` check) and option 1 (the four Management API scopes on the
  Pulumi M2M app's client grant, with its `auth0 api get` check).
- The removal-PR recipe: one PR that deletes
  `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs` and removes the
  three `exclude:` blocks with their marker comments; nothing else; the pin
  and preview tests unchanged before and after.
- Both orderings from `architecture.md` § Bypass lifecycle — (b) merge removal
  PR → `state delete` → dispatch; (a) grant → merge removal PR → dispatch —
  and why (refresh bails on a missing literal exclude; up/preview ignore it;
  the push filter never fires on a workflow-only merge).
- The silent-limitation note: a scope grant produces no pipeline signal; the
  checklist, the gotchas bullet and the Operate backlog seed are the only
  mitigations.
- `docs/backlog.md` line 128 (`Escalate a human-gated blocker that outlives
the run that found it …`, from `maintenance:public-ingress-never-applied`):
  state how this run relates to it — the apply outage it describes is
  bypassed by this run and retired only by the human fix — without claiming
  the line (brief: the run's origin is not a seed). Operate appends the
  removal-condition seed at run close.
- Release authorization: full release per the brief's reading of "fix it"
  (2026-09-12), recorded under `release.md` `assumptions:`.

## Design gaps found

None routed back to Architect. Every component in `architecture.md`
§ Components has an item: Orphan exclusion → 1.2; Preview parity → 1.3;
Bypass guard → 1.1/1.4; Removal record → 1.2/1.3 (marker, canonical), 2.1
(gotchas), and `release.md` + the Operate seed (carried to Ship/Operate above).
Every `defect.md` Done-when criterion is covered: 3 by 1.1–1.4 and V1; 1, 2 by
S2–S5; 4 by the `release.md` content above.

## Stop-and-surface (non-blocking for Implement)

- **SURFACED-1 — the marker names a file that does not exist until Ship.**
  Invariant 5 makes both workflows reference
  `docs/fixes/pulumi-refresh-blocks-apply/release.md`, which is Ship's
  artifact. The guard asserts the string, not the file, so Implement and
  Verify are unaffected; but if `release.md` is committed after the PR merges
  rather than inside it, `main` carries a marker pointing at a missing file
  for that window. Ship decides: commit `release.md` on the run branch before
  merging (which also answers `docs/backlog.md` line 116's complaint about
  artifacts entering git only at Ship), or accept and record the window.

## Notes

Deviations discovered during Implement get logged here, dated. Implement also
records here: the RED and GREEN summary lines with their `git rev-parse HEAD`
(items 1.1 and 1.4), and the statement that no `pulumi`, `doctl`, `wrangler`,
Auth0, `gh workflow run`, or tracker mutation was invoked (item 2.4).

- **2026-09-12 — base moved under the run; branch fast-forwarded (deviation, not design).**
  The brief placed the worktree at `351a99e2b` (== `origin/main`). Between
  item 1.0's install and its diff check, `origin/main` advanced to
  `ec25f648b` (reflog: `fetch --quiet origin main: fast-forward`, from another
  session sharing `.git`): #5327, #5328, #5315. `git diff 351a99e2b ec25f648b`
  restricted to every file this run reads, edits or guards
  (`pulumi-up.yml`, `pulumi-preview.yml`, `pulumi-cli-pin.test.mjs`,
  `pulumi-preview-workflow.test.mjs`, `pulumi-r2-validation-guard.{mjs,test.mjs}`,
  `gotchas.md`, `scripts/vitest.config.mjs`, `scripts/package.json`,
  `pnpm-lock.yaml`, `metrics/ai-antipattern-baselines.json`, `.husky/`,
  `check-ai-antipatterns.mjs`, `check-orphaned-tests.mjs`) is **empty**; the
  only root change is `package.json`'s `repo-audit` script gaining
  `check-analytics-bindings.mjs` (no lockfile change). The branch had zero
  commits of its own, so `git reset --hard origin/main` fast-forwarded it to
  `ec25f648b` (untracked run docs untouched). Every `origin/main`-relative
  acceptance criterion below is measured against `ec25f648b`. Nothing in
  `defect.md`/`architecture.md`'s evidence changes (line numbers cited for
  both workflows are unchanged).
- **2026-09-12 — 1.0 evidence** (HEAD `ec25f648b`): `pnpm install --frozen-lockfile`
  → exit 0 (`Done in 4.3s`); `pnpm --dir scripts test pulumi-cli-pin` →
  `Test Files 1 passed (1)`, `Tests 4 passed (4)`, exit 0;
  `git diff origin/main --stat` → empty. `pnpm build --filter @mbe/cli...` →
  exit 0 (`packages/agent-core/dist/index.js` present for `check-adr --staged`).
- **2026-09-12 — 1.1 RED evidence** (HEAD `ec25f648b`, both workflow files
  byte-identical to `origin/main`, verified with `git diff --quiet origin/main
-- <both>`): `pnpm --dir scripts test pulumi-orphan-exclude-bypass` → exit 1,
  **`Tests 5 failed | 6 passed (11)`**. The five failures, verbatim from the
  assertion messages: (1) `pulumi-up.yml step "Pulumi Refresh (Sync state with
cloud)" has no exclude: input under with:`, (1) `… step "Pulumi Up" has no
exclude: input under with:`, (2) `pulumi-preview.yml step "Pulumi Preview (no
apply, no refresh)" has no exclude: input under with:`, (5) `pulumi-up.yml has
no comment line containing "# TEMPORARY BYPASS — maintenance:pulumi-refresh-blocks-apply"`,
  (5) the same for `pulumi-preview.yml`. Invariants 3, 4, 6 and the
  "marker directly above every exclude:" half of 5 passed vacuously, as
  predicted. Re-run after `prettier --write` on the test file alone: identical
  `5 failed | 6 passed`. `eslint` on the file: exit 0. The six invariants map to
  11 `it()`s (1→2, 2→1, 3→2, 4→1, 5→4 [two files × {presence, adjacency}],
  6→1); every `it()` body contains an `expect(`.
- **2026-09-12 — 1.1 tightening within invariant 1 (assumption, not a contract change):**
  the guard also asserts the `exclude:` value is a YAML _literal_ block scalar
  (`|`, `|-`, `|+`). `pulumi/actions` reads the input with `getMultilineInput`
  (split on newlines), so a folded `>` would join both URNs into one garbage
  entry that refresh rejects and preview silently ignores — while a purely
  line-based textual check would still see two correct lines. The breakdown's
  "verbatim" is read to include the scalar form. Helper note: the step splitter
  copied from `pulumi-preview-workflow.test.mjs` folds `pulumi-up.yml`'s unnamed
  `report-health` job lines into the `Pulumi Up` chunk; `excludeInput()` stops
  at the step's own `with:`/`env:` boundary, and invariant 3's file-wide
  `exclude:` count covers that trailing job's `with:` regardless.
- **2026-09-12 — 1.2 evidence** (HEAD `ec25f648b`, uncommitted edit):
  `git diff --numstat origin/main -- .github/workflows/pulumi-up.yml` → `26 0`
  (additions only); every added line is a `#` comment, `exclude: |`, or one of
  the two URN lines (filtered diff of `+` lines minus those three shapes →
  empty); the `uses:`/`pulumi-version:`/`command:`/`stack-name:`/`work-dir:`/
  `cloud-url:`/`env:`/`NAME: ${{ … }}` line set is identical to `origin/main`
  (line-number-stripped `diff` → empty); no `exclude-dependents:`, `target:` or
  `continue-on-error` anywhere; `pnpm exec prettier --check` on the file →
  clean; `pnpm --dir scripts test pulumi-cli-pin` → `4 passed (4)`, exit 0;
  `pnpm --dir scripts test pulumi-r2-validation-guard` → `14 passed (14)`,
  exit 0. Marker wording per block is tailored ("here (refresh), on `Pulumi
Up` below, and in pulumi-preview.yml" / "here (up), on `Pulumi Refresh`
  above, and in pulumi-preview.yml"); the pinned first line and the
  `release.md` reference are verbatim from § Contracts.
- **2026-09-12 — 1.3 evidence** (HEAD `ec25f648b`, uncommitted edit):
  `git diff --numstat origin/main -- .github/workflows/pulumi-preview.yml` →
  `14 0`; the `exclude: |` + two URN lines are byte-identical to
  `pulumi-up.yml`'s (`diff` of the three-line blocks → empty);
  `workflow_dispatch:` (l.30), `group: pulumi-preview-…` (l.38),
  `cancel-in-progress: false` (l.39), `contents: read` (l.42),
  `command: preview` (l.154), `diff: true` (l.155), `refresh: false` (l.156)
  all present and — since the diff is additions-only — untouched; no forbidden
  keys; prettier clean on both workflows;
  `scripts/__tests__/pulumi-preview-workflow.test.mjs` byte-identical to
  `origin/main` (`git diff --quiet` → yes) and
  `pnpm --dir scripts test pulumi-preview-workflow` → `15 passed (15)`, exit 0.
  The preview block's comment says "here (preview) and on pulumi-up.yml's
  refresh + up steps … the preview must plan the same operation the apply will
  run" — 14 added lines vs 13 in `pulumi-up.yml` because that sentence takes
  one extra comment line.
- **2026-09-12 — 1.4 GREEN evidence** (HEAD `ec25f648b`, worktree carrying the
  1.1–1.3 edits): first GREEN run → exit 1, `1 failed | 10 passed (11)` — a
  **test defect**, not a workflow defect: `steps()` returns fresh objects on
  every call, so invariant 3's "every other step" filter (`s !== upRefresh`)
  never excluded the named steps and reported `pulumi-up.yml step "Pulumi
Refresh (Sync state with cloud)" carries exclude:`. RED could not expose it
  (every `excludeInput()` was null then). Fixed by splitting each file into
  steps exactly once (`upSteps`/`previewSteps`) and deriving both the named
  steps and the "others" from the same arrays. Second GREEN run →
  **exit 0, `Tests 11 passed (11)`**, none skipped. RED re-demonstrated on the
  _final_ test file by stashing only the two workflow edits
  (`git stash push -- <both>`; `git diff --quiet origin/main -- .github/workflows/`
  → identical): exit 1, **`Tests 5 failed | 6 passed (11)`**, the same five
  `it()`s (invariants 1×2, 2, 5×2); `git stash pop` restored `26 0` / `14 0`
  and GREEN again (`11 passed (11)`). Non-docs change set vs `origin/main`
  (tracked `M` + untracked `??`): exactly `.github/workflows/pulumi-up.yml`,
  `.github/workflows/pulumi-preview.yml`,
  `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs`. The
  `git diff --name-only origin/main..HEAD` form is re-measured after the
  milestone-1 commit (see the 2.4 entry).
- **2026-09-12 — commit boundaries (process note):** 1.1–1.4 land as ONE commit
  rather than four — a commit holding only 1.1 (RED test) or only 1.2 (guard
  still red on the preview file) would be a knowingly red commit on the branch.
  The commit message names all four items. 2.1 is its own `docs(gotchas)`
  commit; 2.2/2.3 change no file; 2.4 is the run-docs commit.
- **2026-09-12 — 2.1 evidence** (on top of `74532e108`): one bullet inserted
  at `.claude/rules/gotchas.md:106`, after the `pulumi/pulumi#23478` note
  (l.105) and before `## Dependencies` (l.108);
  `git diff --numstat origin/main -- .claude/rules/gotchas.md` → `1 0`;
  `pnpm exec prettier --check .claude/rules/gotchas.md` → clean; the added
  line contains every required name (both records, #4924 + 2026-09-09T17:05Z,
  #5165, the three blocks, the guard test path, all four scopes, `stack
export`, `state delete`, both orderings, "no pipeline signal",
  `release.md`, #5169, #4848 — checked by `grep -F` against the `+` line).
  No `scripts/__tests__` test reads `gotchas.md` (grep), so 2.2's suite run
  did not need to wait for this edit; `scripts/check-ci-gate-coverage.mjs`
  does read it and is run as an extra gate in 2.3.
- **2026-09-12 — 2.2 evidence** (HEAD `7bc778bd0`): `pnpm --dir scripts test` →
  exit 0, **`Test Files  168 passed (168)`**, **`Tests  3242 passed (3242)`**; the four
  Pulumi guard files (`pulumi-cli-pin`, `pulumi-preview-workflow`,
  `pulumi-r2-validation-guard` × 2) all green inside the suite;
  `git diff origin/main..HEAD --stat -- scripts/__tests__/pulumi-cli-pin.test.mjs
scripts/__tests__/pulumi-preview-workflow.test.mjs
scripts/__tests__/pulumi-r2-validation-guard.test.mjs
scripts/pulumi-r2-validation-guard.mjs` → empty (byte-identical to
  `origin/main`).
- **2026-09-12 — 2.3 evidence** (HEAD `7bc778bd0`), each exit 0 unless noted:
  `pnpm --dir scripts lint` → 0; `pnpm exec prettier --check` on
  `pulumi-up.yml`, `pulumi-preview.yml`, the guard test and `gotchas.md` →
  clean, but the four run docs (`architecture.md`, `autorun-brief.md`,
  `breakdown.md`, `defect.md`) were flagged → formatted with
  `prettier --write docs/fixes/pulumi-refresh-blocks-apply/` (authorised by
  the brief for exactly this case; backed up first — the no-index diff
  ignoring whitespace shows 0–4 changed "words" per file, all markdown
  emphasis-marker normalisation such as `*could*` → `_could_`; no content
  edit to `defect.md`/`architecture.md`), after which the check → 0;
  `node scripts/check-orphaned-tests.mjs` → 0 (`PASS: Every test file lives
under a workspace package that CI runs.`; the script is byte-identical to
  `origin/main`, `ALLOWLIST` untouched); `node scripts/check-ai-antipatterns.mjs`
  (no `--update`) → 0 with `noopTestAssertions: 19 (baseline: 19)` and every
  other counter at baseline; `metrics/ai-antipattern-baselines.json`
  byte-identical to `origin/main`; `node scripts/check-workflow-deps.mjs` → 0;
  `node scripts/check-ci-dispatch.mjs` → 0; extra, because it reads
  `gotchas.md`: `node scripts/check-ci-gate-coverage.mjs` → 0.
  `/local-ci-precheck` was not invoked (optional; the listed gates are the
  subset it would run that touches these files).
- **2026-09-12 — 2.4 evidence** (measured at `7bc778bd0`, before the run-docs
  commit): `git diff origin/main..HEAD -- infrastructure/pulumi/` → empty;
  `git diff --name-only origin/main..HEAD` → exactly
  `.claude/rules/gotchas.md`, `.github/workflows/pulumi-preview.yml`,
  `.github/workflows/pulumi-up.yml`,
  `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs` (the run docs
  join in the commit that carries this line);
  `git diff --numstat origin/main..HEAD -- .github/workflows/` → `14 0` and
  `26 0`; `git diff --stat` → 4 files, 351 insertions, 0 deletions.
  `pnpm build --filter @mbe/cli...` ran (exit 0) before the first commit;
  every commit staged explicit paths only. Commits: `74532e108`
  `fix(ci): exclude two orphaned Auth0 state records from pulumi refresh, up
and preview` (items 1.1–1.4), `7bc778bd0` `docs(gotchas): …` (item 2.1),
  then the `docs(pulumi-refresh-blocks-apply)` commit carrying this file —
  all Conventional Commits, bodies cite `Refs #5169` / `Refs #4848` (never
  `Closes`/`Fixes`), both trailers present. Push verification (`git rev-parse
HEAD` vs `git ls-remote origin refs/heads/fix/pulumi-refresh-blocks-apply`,
  never `git push | tail`) cannot be self-recorded inside the pushed commit;
  it is reported by the Implement stage and is re-checkable by Verify.
  **No `pulumi`, `doctl`, `wrangler`, Auth0, `gh workflow run`, `gh issue`,
  `gh pr` or any other tracker/production mutation was invoked during
  Implement; no `.env` file was read.**
- **2026-09-12 — llms regen outcome:** both commits' post-commit `pack-changed`
  reported `No relevant code changes detected. Skipping context refresh.`;
  no `llms.txt`/`llms-full.txt` changed anywhere (`git status --short` after
  each commit showed only the untracked run directory).
- **2026-09-12 — adjacent observations, not fixed:** (1) the shared `.git`
  carries 217 stash entries from other sessions (top: `WIP on main:
eeeda7a9`), none this run's — worktree hygiene, outside scope;
  (2) `pulumi-preview-workflow.test.mjs`'s `steps()` splitter folds
  `pulumi-up.yml`'s unnamed `report-health` job into the last named step —
  harmless for every current assertion, but a future assertion on "the
  `Pulumi Up` step's `with:` keys" would need to stop at `env:` as
  `excludeInput()` does; (3) the marker comment's first line is 87
  characters after indentation and the two URN lines are 108/110 — prettier
  accepts both (comments and literal block scalars are never reflowed).
