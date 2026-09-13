---
stage: review
run: maintenance:pulumi-refresh-blocks-apply
date: 2026-09-13
assumptions:
  - "Maintenance soft-gate reading: this is a `maintenance:` run, so `prd.md` is absent by design and no PRD gate applies; `verification.md` (PASS) precedes this stage, so the artifact order is not inverted."
  - "Default taken: read-only stance — no `pulumi`, `doctl`, `wrangler`, Auth0, `gh workflow run`, `gh issue` or `gh pr` invocation of any kind, and no `.env` read; the refresh-side behaviour of `--exclude` is verified from the pinned CLI/engine source at v3.253.0 and the bundled action, not from a live refresh (verification.md V5 stays unverifiable pre-merge)."
  - "Default taken: `docs/fixes/pulumi-refresh-blocks-apply/release.md`, named by the marker comments, the gotchas bullet and the guard test, is Ship's artifact; Review did not create it and records the dangling reference as a Minor finding for Ship rather than fixing it."
  - "Default taken: severity scale — Critical = Ship would apply a wrong plan or the apply path stays dead; Major = a claim or guard a maintainer would act on that the code does not satisfy, or a missing safety property; Minor = wording, traceability or bypass-lifetime hygiene with no production effect."
  - "Default taken: the one Minor fix is docs-only, so it lands as a `docs(gotchas)` commit (the run's own Implement precedent, `7bc778bd0`) rather than a `fix(...)` commit, with the same trailers and `Refs #5169` / `Refs #4848`."
---

# Review: pulumi-refresh-blocks-apply — `--exclude` two orphaned Auth0 records on refresh, up and preview

## Scope

Branch `fix/pulumi-refresh-blocks-apply` at `0e55282d6` (commits `74532e108`
fix(ci), `7bc778bd0` docs(gotchas), `33b494b02`/`0e55282d6` run docs), based on
`origin/main` = `ec25f648b`. `git diff --name-only origin/main..HEAD`, non-docs:

- `.github/workflows/pulumi-up.yml` (+26, 0 deletions): a marker comment and an
  `exclude: |` literal block scalar with two URNs under the `with:` of
  `Pulumi Refresh (Sync state with cloud)` (l.112–124) and `Pulumi Up`
  (l.144–156).
- `.github/workflows/pulumi-preview.yml` (+14, 0): the same block under the
  preview step (l.160–173).
- `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs` (+310, new): a
  textual guard (no YAML parser) with 11 `it()`s across invariants 1–6.
- `.claude/rules/gotchas.md` (+1): one bullet under "Pulumi / R2 state backend".

Reviewed: both workflow files in full (181 and 218 lines), the diff line by
line, the guard test in full, the gotchas bullet and every claim in
`defect.md`/`architecture.md`/`breakdown.md`/`verification.md` that the code has
to satisfy. Evidence pulled read-only: `pulumi/actions` at
`8e5e406f4007fca908480587cb9893c07090f58d` (v7.0.0) — `action.yml`,
`src/config.ts`, `src/libs/utils.ts`, `src/main.ts`, `dist/index.js`;
`pulumi/pulumi` at `v3.253.0` — `pkg/cmd/pulumi/operations/refresh.go`,
`pkg/resource/deploy/deployment_executor.go`, `step_generator.go`, `step.go`,
`pkg/resource/graph/dependency_graph.go`; workflow-run logs `34743839849`
(this branch's preview) and `34425499302` (main, pre-bypass); the #4924 diff
(`3b8c3d7c7`) and its revert (`6c0a54c51`). No `pulumi`, `doctl`, `wrangler`,
Auth0, `gh workflow run`, `gh issue`/`gh pr` call and no `.env` read.

Gates re-run on this branch after the one fix below:
`pnpm --dir scripts test pulumi-orphan-exclude-bypass` → `11 passed (11)`;
`pnpm --dir scripts test` → `Test Files 168 passed (168)`, `Tests 3242 passed (3242)`;
`pnpm --dir scripts lint` → exit 0; `pnpm exec prettier --check` on the two
edited docs → clean.

## Findings

### Minor: `gotchas.md:106` claimed the guard refuses re-declarations "under `infrastructure/pulumi/`", but invariant 6 scans only the top-level `*.ts` files

- Where: `.claude/rules/gotchas.md:106` (claim) vs
  `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs:302-303`
  (`readdirSync(dir).filter((f) => f.endsWith(".ts"))` — non-recursive).
- Scenario: a future change re-lands
  `new auth0.Tenant("mattbutlerengineering-tenant", …)` in a nested module
  (say `infrastructure/pulumi/auth0/tenant.ts`, imported from `index.ts`)
  while the bypass is active. The guard stays green, `pulumi up --exclude`
  gives the re-declared resource a `SameStep` (`isExcludedFromUpdate`,
  `step_generator.go:189`), the run is green and the program's Tenant never
  applies — exactly the outcome invariant 6 exists to refuse, and the bullet
  told the reader it was covered. No `.ts` exists below the top level today,
  so this is a doc/code contract mismatch, not a live defect.
- Decision: **fixed** — commit `644897321` narrows the claim to "in the
  top-level `infrastructure/pulumi/*.ts` program files (the scan is not
  recursive)" and adds one dated line to `breakdown.md` § Notes. The test is
  deliberately unchanged: a recursive walk would descend into
  `infrastructure/pulumi/node_modules` (where `@pulumi/auth0`'s own `.d.ts`
  files live), which is not a surgical change. Edited lines re-read after the
  write; gates above re-run on the result.

### Minor: the three marker comments, the gotchas bullet and the guard test's `RECIPE` constant point at `docs/fixes/pulumi-refresh-blocks-apply/release.md`, which does not exist on the branch (breakdown SURFACED-1)

- Where: `pulumi-up.yml:121,153`, `pulumi-preview.yml:170`, `gotchas.md:106`,
  `pulumi-orphan-exclude-bypass.test.mjs` (`RECIPE`); the test asserts the
  path string sits above each `exclude:` (invariant 5), not that the file
  exists, so nothing goes red.
- Scenario: the bypass merges; a maintainer who later hits the 403 (or the
  refresh bail-out from ordering (b) done backwards) follows the marker to the
  recipe and finds no file — for the whole life of the bypass on `main` if
  `release.md` only lands in a later close-out PR.
- Decision: **deferred — Ship owns `release.md`.** Recommendation for Ship:
  commit `release.md` on this branch before opening the PR. Precedent on
  `origin/main` for a release record shipping with its code:
  `docs/fixes/rialto-web-usage-instrumentation/release.md` in `ec25f648b`
  (#5315) and `docs/fixes/visual-tolerance-threshold/release.md` in
  `8b252864c` (#4613).

## Passes with no findings

**Correctness — the `exclude:` input reaches all three CLI invocations.**
`action.yml` documents `exclude` ("Specify a single resource URN to ignore.
Multiple resources can be specified one per line"). `src/config.ts:102`:
`exclude: parseSemicolorToArray(getMultilineInput('exclude')),` where
`getMultilineInput` (bundle l.228, `@actions/core`) splits on `\n`, drops
empties and trims, and `parseSemicolorToArray` (`src/libs/utils.ts`) splits
each line on `,`. `src/main.ts:103-111` spreads `config.options` into every
command: `up: () => stack.up({ onOutput, ...config.options })`,
`refresh: () => stack.refresh({ onOutput, ...config.options })`,
`preview: … stack.preview(config.options)`. The bundled automation API
(`@pulumi/pulumi` `^3.206.0`) pushes `"--exclude", eURN` per entry in
`up` (bundle l.27660), `preview` (l.27808) and `refresh` (l.27956:
`const args = ["refresh"]; … if (opts.exclude) { for (const eURN of opts.exclude) { args.push("--exclude", eURN); } }`).
`--continue-on-error` is only ever emitted for `up`/`destroy`, never
`refresh`. The pinned CLI accepts the flag on refresh:
`pkg/cmd/pulumi/operations/refresh.go:415-416` declares
`StringArrayP("exclude", "x", …)`, l.339 passes
`Excludes: deploy.NewUrnTargets(excludeUrns)`, and l.500 marks `target` and
`exclude` mutually exclusive — which is why the guard's "no `target:`"
invariant is load-bearing, not cosmetic.

**Correctness — the literal block scalar survives YAML → action input.** Run
`34743839849` (this branch, `workflow_dispatch`, headSha `33b494b02`) echoes
the inputs as two intact lines (log l.659-660:
`exclude: urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant`
/ `urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding`),
with `refresh: false`, `diff: true`, `exclude-dependents: false`,
`target` unset, `continue-on-error: false`. The plan moved from main's
`- 2 to delete / 13 unchanged` (run `34425499302`, both rows
`auth0:index/…: (delete)` under provider `default_3_51_0`) to
`~ 3 to update / 15 unchanged` with zero deletes; the three updates are two
`cloudflare:index/workersScript:WorkersScript` rows (provider
`default_6_19_0 => default_6_20_0`) and one `digitalocean:index/app:App`
(`spec.ingress.rules[6]`, the #4565 `/public` ingress) — no `auth0` row
anywhere. `Pulumi.yaml`'s `name: mbe-infrastructure` matches the URN project
segment; the stack is `prod`.

**Correctness — refresh bails on a stale literal, up/preview ignore it (the
gotchas/architecture asymmetry claim).** `deployment_executor.go:706` is the
only `checkTargets(…Excludes)` call and it sits in `refresh()`; the up
`Execute` path checks `ReplaceTargets` (l.188) and `Targets` (l.328) only.
`checkTargets` (l.54) iterates `targets.Literals()` and fails with
`one or more targets could not be found in the stack` (l.82). Both records
are in state until (b) deletes them, so the ordering rules in gotchas and the
marker are the right ones.

**Correctness — the two records are carried as `unchanged`, never deleted,
and nothing else is skipped.** With `--exclude`, `GenerateDeletes`
(`step_generator.go:2251`) takes the `excludesOpt.IsConstrained()` branch →
`determineForbiddenResourcesToDeleteFromExcludes` (l.2595) →
`getExcludeDependencies`, whose frontier is the two URNs plus
`DependenciesOf` (provider, parent, `Dependencies`, `PropertyDependencies`,
`DeletedWith`/`ReplaceWith` — `dependency_graph.go:201-206`); dependents are
added only under `--exclude-dependents`, which the guard forbids. Forbidden
resources get `NewSameStep`, and `SameStep.Apply` (`step.go:157-159`)
retains ID and outputs. Consequence checked: the records reference provider
`pulumi:providers:auth0::default_3_51_0` while the program now resolves
`@pulumi/auth0` 3.52.0 (`pnpm-lock.yaml` importer `infrastructure/pulumi`);
because the provider is in `DependenciesOf`, a future provider transition
during the bypass's lifetime cannot delete `default_3_51_0` out from under the
excluded records. #4924 (`3b8c3d7c7`) touched only `auth0.ts` and
`index.test.ts` and no other resource referenced `tenant`/`branding`, so the
exclusion has no dependency edges to widen. In `refresh()`
(`deployment_executor.go:718-751`) excluded URNs are `continue`d before any
provider call, so the 403 can no longer occur.

**Correctness — the rest of the apply path is untouched.** `Pulumi Cancel +
Clear Pending Operations` (`pulumi-up.yml:80`) talks only to the state
backend (`login`, `cancel`, `stack export | python3 | stack import`) — no
provider call, so no exclusion is needed there. `infrastructure/pulumi/auth0.ts`
declares ResourceServer, Client, ClientGrant and two Users — neither Tenant
nor Branding. `pulumi-preview.yml` keeps `workflow_dispatch:` only,
`cancel-in-progress: false`, `refresh: false`, `diff: true`. Both diffs are
additions-only; `pulumi-version: 3.253.0` and the `Pin Pulumi CLI` step are
unchanged and agree with the engine version read above.

**Correctness — the guard test is not vacuous and `steps()` folding is not a
false-green risk.** All 11 `it()`s contain an `expect(`; `verification.md`
recorded RED `5 failed | 6 passed (11)` on `origin/main`'s workflow files and
GREEN `11 passed (11)`. `excludeInput()` reads the step's own first `with:`
and stops at `env:`, so `report-health`'s unnamed `- uses:` steps folded into
the `Pulumi Up` chunk cannot supply the value; invariant 3's file-wide
`exclude:` count covers that trailing job regardless. A folded `>`, an inline
value or a sequence all fail invariant 1's literal-block check (a `>` would
join both URNs into one entry that refresh rejects and preview ignores).
`upSteps`/`previewSteps` are split once (the test defect breakdown § Notes
records is fixed in the committed file). Invariant 6 is gated on
`bypassActive` so it goes vacuous, not red, once the blocks are removed.

**Design — matches architecture § Interfaces & contracts and § Bypass
lifecycle.** Exclusion at the action's `exclude:` input on all three
invocations; no `exclude-dependents`/`target`/`continue-on-error`; parity on
the URN list only (the `pulumi-preview-workflow.test.mjs` `with:` blind spot
is a recorded decision, and the new guard's byte-identical check closes it
for this block); a new self-contained guard file that is deleted with the
blocks; removal condition (a)/(b) and both orderings appear verbatim in the
marker, the gotchas bullet and the test's comments. The gotchas bullet's other
claims — both record names, #4924 at 2026-09-09T17:05Z, #5165, three blocks,
the guard path and invariants, all four scopes, `stack export` backup,
`state delete` ×2, the workflow-only-merge-fires-no-run rule, "a scope grant
produces no pipeline signal" — are each satisfied by the code or by
`pulumi-up.yml`'s push `paths` filter.

**Security.** `permissions: contents: read` in both workflows
(`pulumi-up.yml:25-26`, `pulumi-preview.yml:41-42`); no `pull_request_target`;
no trigger, secret or `env:` line changed. The exclusion is a static YAML
literal passed as argv by the action (no shell, no `${{ }}` expression), and
the URNs contain no credential. Secret grep, verbatim:
`git diff origin/main..HEAD | grep -iE 'token|secret|key|password|AKIA|sk_live'`
→ 54 lines (`key` ×45, `secret` ×18, `token` ×1); restricted to the four
non-doc files the matches are unchanged context lines
`PULUMI_CONFIG_PASSPHRASE: ${{ secrets.PULUMI_CONFIG_PASSPHRASE }}` /
`AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}` (three hunks, no `+`
prefix), the test's `EXCLUDE_KEY`/`EXCLUDE_DEPENDENTS_KEY`/`TARGET_KEY`
regex identifiers and `keyIdx`/`keyLine`/`keyIndent` locals, and one comment
containing "Key matchers"; the remaining matches are run-doc prose and
Pulumi's `[secret]` redaction marker quoted from the preview transcript. No
credential, key id or token value anywhere in the diff.

**Repo gates.** `metrics/ai-antipattern-baselines.json` byte-identical to
`origin/main`; no `check-ai-antipatterns.mjs --update`; `check-orphaned-tests`
passes (recorded in breakdown 2.3, script unchanged); the guard lives under
`scripts/vitest.config.mjs`'s include glob and therefore inside CI's `test`
job.

## Verdict

NO unfixed critical findings — Ship may proceed. 2 findings: 0 critical,
0 major, 2 minor (one fixed in `644897321`, one deferred to Ship: commit
`release.md` on the branch before the PR, per the recommendation above).
Residual risk Ship should carry into the release record: the refresh-side
`--exclude` has not run against production state (verification V5); every
piece of static evidence — the action's argv assembly, the CLI flag, the
engine's early `continue` for excluded URNs — says it will, and the failure
mode if it does not is the status quo (refresh red, `Pulumi Up` skipped), not
a wrong apply. Next stage: Ship.
