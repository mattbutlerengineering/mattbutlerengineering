---
stage: decompose
run: maintenance:public-ingress-never-applied
date: 2026-08-24
assumptions:
  - "No live cut review. The decompose skill's step 4 (`present the draft; the user's judgment calls are the milestone boundaries and anything that looks mis-sized`) was answered from `autorun-brief.md` rather than by the user. Boundaries follow the brief's 2026-08-24 revision directive — the halves are cut apart, and every boundary carries an explicit statement of what is and is not demonstrable there. Item ordering puts the failing checks first, per CLAUDE.md's TDD mandate."
  - 'Edge prefix-match semantics are NO LONGER an assumption — routed as gap G2 and answered by Architect (`architecture.md` 2026-08-24 amendment). Kept in this list only because item 3.2 was drafted before the answer arrived; the resolution is Architect''s, not this stage''s. Confirmed contract, unchanged from what 3.2 had proposed: a prefix `p` matches path `s` iff `s === p || s.startsWith(p + "/")`, matched on `url.pathname` only (query excluded), case-sensitive, and `originRoutes` order is explicitly NOT significant — the branch is a single boolean, so the array is a set, not an ordered dispatch table. Keeping `staticRoutes` on its own looser matcher is recorded by Architect as a deliberate non-goal (converging them would change what `/hospitality-anything` returns today), not an oversight.'
  - 'Both new production probes carry `requireHeaders: ["x-ratelimit-limit"]`. `architecture.md` names the probes'' path, host, expected status and `expectBodyIncludes` but not their required headers, while `scripts/__tests__/check-api-surface-invariants.test.mjs`''s `requires the rate-limit header on every probe` mandates that every probe declare one. Keeping the header is safe because it was measured, not assumed, on 2026-08-24: `GET https://mattbutlerengineering.com/api/v1/venues` returns `x-ratelimit-limit: 100` through the Cloudflare edge (so the edge does not strip it), and `services/reservations/src/routes/public-venues.ts` declares no route-level `config.rateLimit`, so it inherits the service-wide `onRequest` limiter that emits the header. Without that measurement this choice would have risked a permanently-red gate after a correct apply.'
  - "The one authorized merge is executed as a PR containing ONLY `.github/workflows/pulumi-preview.yml` and its workflow-shape test, branched from `main` — not from the fix branch. The brief authorizes one merge but does not say how to carry it. Cutting it from the fix branch would drag the run's other changes onto `main`, and would also red `main`, because the de-vacuumed `ingress-coverage.test.ts` from Milestone 1 fails by design until Milestones 2 and 3 land."
  - "Both production reachability probes are expected to STILL FAIL when this run ends. They can only pass after a `pulumi up`, which prepare-and-stop forbids. Verify must read two failing probes as the run's correct end state, not as a failed run. Recorded here so the next stage cannot mistake it."
  - "The preview transcript is saved to `docs/fixes/public-ingress-never-applied/preview.txt` — full stdout of `pulumi preview --diff`, the run URL, the SHA it evaluated, the bundle fingerprint item 4.1 emits, and the per-resource verdict table item 4.5 records. The protocol names no file for it; `verification.md` quotes from it."
---

# Breakdown: restore `/public` by opening both gates, and stop at a readable preview

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

## Read this first: the shape of this run

**No milestone in this run makes `/public/v1/**` reachable.** Release
authorization is prepare-and-stop (`autorun-brief.md`), so nothing is applied
and nothing but one read-only workflow is merged. Every "green" below is a
green _source-level_ check on an unmerged branch. The endpoint stays dead
until someone runs `pulumi up`, which is `release.md`'s subject, not this
breakdown's.

That matters because this defect _is_ a false green: `ingress-coverage.test.ts`
passed for three months over a 100%-dead surface. Reading any checkbox here as
"the booking widget works now" repeats the exact mistake the run exists to fix.

**Two gates, in series, both shut** (`defect.md` § Notes, `architecture.md`):

| Gate            | Where                                                           | Today                                                                                                    | Opened by   |
| --------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------- |
| Cloudflare edge | `infrastructure/worker/edge-router.js:143` proxies only `/api/` | `GET https://mattbutlerengineering.com/public/v1/venues/x` → `200 text/html` (the marketing site)        | Milestone 3 |
| DO app spec     | `infrastructure/pulumi/index.ts:245` `ignoreChanges: ["spec"]`  | `GET https://api.mattbutlerengineering.com/public/v1/venues/x` → `404` Fastify route-miss from users-api | Milestone 2 |

Out of scope, already tracked: full DO spec reconciliation (issue #3277, plus
the `docs/backlog.md` seed reconciled in item 4.6).

## Gates that apply to every item

Not repeated per item; an item is not done until these hold for the files it
touched.

- `pnpm lint`, `pnpm typecheck`, and the touched package's `test` script pass —
  _except_ where an item's own acceptance criterion says a named test must be
  RED (Milestone 1 items 1.1–1.3 are exactly that case).
- Any item touching `infrastructure/pulumi/**`: `pnpm build --filter @mbe/cli... && pnpm regen`,
  then commit the regenerated `infrastructure/pulumi/llms.txt` / `llms-full.txt`
  (and root `llms*.txt` if they move). `pnpm regen --check` is clean.
  Skipping this is the Integrity-job failure recorded in
  `.claude/rules/gotchas.md` § Build / pnpm / turbo.
- Work happens on the run's fix branch, which is **not merged**. Item 4.2 is
  the sole exception and carries its own isolation criterion.

---

## Milestone 1: Both gates become visible (the checks go RED before anything is fixed)

**Demonstrable at this boundary:** five checks that were silent now speak.
`pnpm --dir infrastructure/pulumi test` fails and names which gate is shut;
`node scripts/check-api-surface-invariants.mjs` reports two non-`ok` probes
against the live hosts. From here on, every later milestone has a check that
can contradict it — the run loses the ability to declare success by inspection,
which is the specific thing missing for three months.

**Not demonstrable at this boundary:** nothing about production changes. Both
URLs in the table above answer exactly as they did before. The tests are on an
unmerged branch, so the repo's own CI still cannot see them either.

- [x] **1.1 Assertion B — managed-ness** — in `infrastructure/pulumi/ingress-coverage.test.ts`, assert that no `ignoreChanges` entry on the `digitalocean.App` resource is `spec` or a prefix of `spec.ingress`.
  - Accept: the new test is RED against current `origin/main` source with a message naming `ignoreChanges: ["spec"]` as the reason a source ingress rule cannot reach production; it reads the real array out of `index.ts` (not a fixture); and it turns green in item 2.1 without further edits to the test.
  - Blocked by: —

- [x] **1.2 Assertion A — two gates, not one** — extend the coverage assertion so every prefix a service registers must be covered _both_ by a non-catch-all DO ingress rule in `index.ts` **and** by an `originRoutes` prefix in `infrastructure/worker/routes-config.json`.
  - Accept: the test is RED against current source, and its failure names the **edge** side specifically (`originRoutes` absent / `/public/v1/...` uncovered at the edge) — a failure message that mentions only the DO side does not satisfy this item, because reading only the DO side is what let the edge gate hide. Goes green in item 3.1.
  - Blocked by: —

- [x] **1.3 Assertion C — parse guard over both new sources** — extend the existing "reads real prefixes from both sides" guard to cover the `ignoreChanges` reader (1.1) and the `originRoutes` reader (1.2).
  - Accept: mutating each reader's regex/selector to match nothing makes a guard test fail rather than making 1.1 or 1.2 pass vacuously — demonstrate by temporarily breaking each reader and recording that a test goes red. Readers throw _inside_ the assertion that uses them, never at module scope, so one missing source fails one test instead of erroring the whole file.
  - Blocked by: 1.1, 1.2

- [x] **1.4 Probe engine: origin, body, and the `wrong-service` verdict** — in `scripts/check-api-surface-invariants.mjs`, add an optional per-probe `origin` (so one invocation covers both hosts), an optional `expectBodyIncludes` (requires `runProbe` to read the body it currently discards), and a fifth `ProbeState`, `wrong-service`.
  - Accept: unit tests in `scripts/__tests__/check-api-surface-invariants.test.mjs` cover — `classifyProbe` returns `wrong-service` when status matches but the body lacks the required substring; `wrong-service` is ordered after `unreachable` and after `status-mismatch`; `isRetryable("wrong-service") === false`; and the existing `covers every declared state` / `only ever returns a declared state` tests are extended to the new state rather than left listing four. `PROBE_STATES` and the failure-report copy both include it. Existing five probes' behaviour is unchanged.
  - Blocked by: —

- [x] **1.5 The two production reachability probes** — add `GET /public/v1/venues/<absent-slug>` against `https://api.mattbutlerengineering.com` and against `https://mattbutlerengineering.com`, both `expectStatus: 404`, both `expectBodyIncludes: "Venue not found"`, both `requireHeaders: ["x-ratelimit-limit"]`.
  - Accept: running `node scripts/check-api-surface-invariants.mjs` against live production today exits non-zero with the `api.` probe reporting `wrong-service` (404 body is the Fastify route-miss, not `Venue not found`) and the apex probe reporting `status-mismatch` (it answers `200 text/html`). Both verdicts are recorded verbatim. **Do not "fix" the classifier to force both into one state** — the two hosts fail for two different reasons and that is the signal. The existing `requires the rate-limit header on every probe` and `never expects a success status` tests still pass unmodified.
  - Blocked by: 1.4

---

## Milestone 2: The DO gate is managed again (source-level only)

**Demonstrable at this boundary:** assertion B (1.1) goes green. A reader can
confirm from one array in one file that an ingress change is no longer
swallowed, instead of reasoning about what a whole-object ignore covers.

**NOT demonstrable at this boundary — read this before calling the milestone
done.** Nothing a user can observe has changed, and nothing would change if
this milestone shipped alone. The request still dies at the Cloudflare edge:
`GET https://mattbutlerengineering.com/public/v1/venues/x` → `200 text/html`,
measured 2026-08-24. Even at `api.` nothing moves until an apply, which this
run is not authorized to perform. **Precondition P1 is not settled here** — a
green `pnpm test` proves the source is self-consistent, and this defect is
precisely the case where a green check and a dead surface coexisted for three
months. P1 is settled by reading the preview in item 4.5 and by nothing else.

**Why cut here at all, given that:** the two halves ship through the same
`pulumi up` but land on **different Pulumi resources** —
`digitalocean:index:App` for the ingress rule,
`cloudflare:index:WorkersScript mattbutlerengineering-edge-router` for the
worker, whose `content` is `readFileSync("../worker/dist/edge-router.js")` at
`index.ts:283`. The run's deliverable is a per-resource reading of one preview
diff (4.5). Landing the halves as separate commits is what makes that diff
attributable: if both arrive in one commit and the preview shows unexpected
churn, nothing can say which half caused it. The cut buys attribution in the
one artifact this run exists to produce.

- [x] **2.1 Narrow `ignoreChanges` from the whole spec to `ingress`'s siblings** — `infrastructure/pulumi/index.ts:245`: `ignoreChanges: ["spec"]` becomes `["spec.features", "spec.jobs", "spec.services"]`.
  - Accept: the array is exactly those three entries, in that order, with no `[*]`, `[0]`, or any array traversal (P1's whole point is that this design removes the unvalidated nested-array syntax). Test 1.1 goes green with no edit to the test. The existing comment is replaced with one that states what is now managed (`name`, `region`, `domainNames`, `ingress`) and what stays deliberately unmanaged (`jobs`, `services` — so env vars, instance sizes and component config remain exactly as unmanaged as today), and says the narrowing is validated by the preview, not by a green `pulumi up`. `infrastructure/pulumi`'s existing `index.test.ts` still passes.
  - Blocked by: 1.1

---

## Milestone 3: The edge gate is open (source-level only)

**Demonstrable at this boundary:** assertion A (1.2) goes green, and
`edge-router.test.js` shows `/public` and `/public/v1/...` taking the same
origin-proxy branch as `/api` — circuit breaker, rate limiter, forwarded
headers, `X-Feature-Flags` stripping and verbatim path preservation all
inherited, because it is the same branch.

**Not demonstrable at this boundary:** still nothing in production. The worker
is deployed by `pulumi up` (`pulumi-up.yml` bundles it and `index.ts` uploads
it), so the edge change is as unapplied as the DO change. Both URLs in the
table above answer exactly as they did at the start of the run.

- [x] **3.1 Add `originRoutes` to the edge topology registry** — `infrastructure/worker/routes-config.json` gains `"originRoutes": ["/api", "/public"]`.
  - Accept: test 1.2 goes green. `infrastructure/worker/routes-config.test.js` gains a schema assertion in the style of its siblings — `originRoutes` is a non-empty array of strings, each starting with `/`, containing both `/api` and `/public` — so a future edit that drops the key fails there rather than silently un-proxying a surface. `scripts/check-service-bindings.js` still passes (it reads `staticRoutes[].binding` and is unaffected).
  - Blocked by: 1.2

- [x] **3.2 `edge-router.js` reads `originRoutes` instead of the hardcoded prefix** — replace `url.pathname.startsWith("/api/") || url.pathname === "/api"` at `edge-router.js:143` with a check driven by `topologyConfig.originRoutes`.
  - Accept: the matcher is exactly `s === p || s.startsWith(p + "/")` per prefix — never a bare `startsWith(p)` — read off `url.pathname` only (query excluded) and case-sensitive, all four points now specified by Architect (G2, closed). Every existing `describe("API proxy")` test in `infrastructure/worker/edge-router.test.js` passes **unmodified** (including `proxies /api (without trailing slash)`, the flag-stripping test, and the no-KV-read hot-path test) — for `/api` this is a pure refactor, and a refactor that changes what any live path returns is not a refactor. New tests assert: `/public`, `/public/v1/venues/x` and `/public/v1/guests/unsubscribe` proxy to `API_ORIGIN` with the path preserved verbatim and the same headers; `/publicity` and `/apiary` do **not** proxy (both serve the marketing SPA today — measured `200 text/html`, 7130 bytes at the apex, 2026-08-24 — and must keep doing so); a query string does not affect matching; a case-variant path (`/Public/v1/...`) does not proxy; and **reversing `originRoutes` produces identical routing for every case above**, pinning Architect's "order is not significant, the array is a set" as a test rather than a comment. `staticRoutes` and its matcher are **not touched** — converging the two is a recorded non-goal, and its looseness is out of this run's bounds. No topology string is left hardcoded in `edge-router.js`. The file-header route comment is updated to list `/public/*`.
  - Blocked by: 3.1

- [x] **3.3 Amend ADR-011 for the new origin-route ownership** — add an amendment to `docs/adr/ADR-011-edge-routing-architecture.md` in the same form as its 2026-07-11 (#3349) amendment.
  - Accept: the amendment records that `/public/*` proxies to `API_ORIGIN`, that origin prefixes are now owned by `routes-config.json`'s `originRoutes` (closing the ADR's own "no topology is hardcoded in `edge-router.js`" rule, which the `/api` branch had been violating), and cites this run directory. The derived Routing Table gains its `/public/*` row. `pnpm check:adr` and the `adr-compliance-reviewer` pass on the diff.
  - Blocked by: 3.2

---

## Milestone 4: A real preview, read and recorded — the run's deliverable

**Demonstrable at this boundary:** a real `pulumi preview --diff` exists,
produced on the engine that will apply (pinned CLI `3.253.0`), against the
prod stack, evaluating a branch that carries both halves — captured, read
per-resource, and recorded. That is exit criteria 1 and 2.

**Still not demonstrable, by authorization:** `/public/v1/**` is unchanged in
production. Both probes from 1.5 still fail. One read-only workflow is merged;
everything else stays on the branch. This is the authorized end state of the
run, not a shortfall.

- [ ] **4.1 Author the dispatch-only preview workflow** — `.github/workflows/pulumi-preview.yml`: `workflow_dispatch` only, pinned Pulumi `3.253.0`, the same R2 cloud-url and secret set `pulumi-up.yml` uses, and the prerequisite build steps the program needs to evaluate at all.
  - Accept: the workflow (a) triggers on `workflow_dispatch` and nothing else; (b) runs `pnpm install --frozen-lockfile`, `pnpm build --filter=@mbe/gen` and the esbuild bundle into `infrastructure/worker/dist/edge-router.js` — without all three the program throws at `index.ts:283`/`:305` before producing any diff, since `dist/` is gitignored; (c) pins the CLI to an exact `3.253.0` both in the install step and in every `pulumi/actions` step's `pulumi-version:` (an unpinned default of `^3` reintroduces the R2 `InvalidDigest` outage of #4117/#4118); (d) contains **no** `up`, `destroy`, `refresh`, `cancel`, `stack import`, or `stack export` — `pulumi-up.yml`'s state-clearing preamble is a mutation and must not be copied; (e) `permissions: contents: read` only; (f) any `run:` block whose exit code is the point opens with `set -o pipefail`; **(g) build-env parity** — the gen build reproduces `pulumi-up.yml`'s build _inputs_, not just its steps: same `pnpm build --filter=@mbe/gen` with the same five env vars and the same values/secret expressions (`VITE_AUTH_AUTHORITY`, `VITE_AUTH_CLIENT_ID`, `VITE_AUTH_AUDIENCE`, `VITE_AUTH_REDIRECT_URI`, `VITE_API_URL` — verified at `.github/workflows/pulumi-up.yml:52-59`), and the esbuild invocation reproduces `:61-67` flag-for-flag, because a different env produces a different asset manifest and turns 4.5's `gen: unchanged` row into a false finding — carrier drift misread as a defect; **(h) bundle fingerprint** — after bundling, print `sha256sum infrastructure/worker/dist/edge-router.js` and the occurrence count of `originRoutes` in that bundled file, both surfaced in the job log/step summary for 4.5 to copy into `preview.txt`, because `content` is one opaque bundled string and a rendered `~ content` diff proves the bundle changed, never that it changed _correctly_. (g) and (h) read local build artifacts only — still read-only, no new credential, no mutation, inside the one authorized merge's bound. A test at `scripts/__tests__/` (modelled on `pulumi-cli-pin.test.mjs`) reads the real workflow file and fails on any of (a), (c), (d) regressing, and additionally reads **both** workflows and fails if the preview workflow's gen-build env var name set diverges from `pulumi-up.yml`'s, so a future edit to either one cannot silently break parity.
  - Blocked by: —

- [ ] **4.2 Merge it — the one and only authorized merge** — open a PR from `main` containing **only** `.github/workflows/pulumi-preview.yml` and its 4.1 test, and merge it. GitHub only accepts `workflow_dispatch` for files already on the default branch, which is why this merge exists (P2).
  - Accept: `git diff --name-only main...<branch>` lists exactly those two paths and nothing else; the branch's merge-base is `main`, not the fix branch; `CI Gate` is green as a real `pull_request`-triggered check (per `.claude/rules/gotchas.md` § CI, verify a `CI Gate` context actually exists — `fail=0 pend=0` alone is indistinguishable from `gate-missing`); after merge `gh workflow list` shows the workflow. **No** Pulumi or edge-worker source change from Milestones 1–3 appears in this PR — `main` must stay green, and the de-vacuumed `ingress-coverage.test.ts` is RED by design until 2.1 and 3.1 land.
  - Blocked by: 4.1

- [ ] **4.3 Bring the fix branch up to date so the workflow exists on the dispatched ref** — merge `main` into the run's fix branch after 4.2.
  - Accept: `.github/workflows/pulumi-preview.yml` is present on the fix branch (a `workflow_dispatch --ref <branch>` runs the workflow file **as it exists on that ref**, so an out-of-date branch either fails to dispatch or silently runs the wrong definition); the branch still carries every Milestone 1–3 commit; llms/dep-graph artifacts are regenerated after the merge per `.claude/rules/gotchas.md` (`gh pr update-branch` drifts them).
  - Blocked by: 4.2, 2.1, 3.3

- [ ] **4.4 Serialize against in-flight deploys (P3)** — confirm no `Pulumi Deploy` and no `Deploy Services` run is in progress before dispatching.
  - Accept: `gh run list --workflow=pulumi-up.yml --status in_progress` and the same for `deploy-services.yml` both return empty, recorded with a UTC timestamp in `preview.txt`. Re-checked immediately before 4.5 dispatches, not once at the start of the milestone.
  - Blocked by: —

- [ ] **4.5 Dispatch, capture, and read the preview at two levels** — run the workflow against the fix branch, save the full output, and record the preview-level outcome plus one named verdict per resource, per `architecture.md` § _Preview → reader: the per-resource verdict_.
  - Accept: `docs/fixes/public-ingress-never-applied/preview.txt` contains the complete `pulumi preview --diff` stdout, the run URL, the SHA the run actually evaluated (`gh run view <id> --json headSha` — never the branch's current head, per the #4512 trap in gotchas), and the `sha256sum` + `originRoutes` occurrence count item 4.1(h) emits. The reading is **two levels, in order** — not the four `ignoreChanges` signatures applied per resource, which Architect corrected as a category error (_silent no-honor_ is a property of `ignoreChanges`, which only the App carries; _rejected_ is preview-level and leaves no rows to read):
    - **Level 1 — preview-level outcome.** The engine either produced a plan or errored. _Rejected_ (an unparseable `ignoreChanges` property path) lives here and only here: it aborts before any resource has a row, so an errored preview has nothing to read at level 2 and **P1 is answered `no`**.
    - **Level 2 — one verdict per resource** over all 16 stack resources, against the architecture's table. Expected: `digitalocean:index:App mattbutlerengineering-api-app` → `~ updated`, diff confined to `spec.ingress.rules`, exactly the `/public` rule added (this row is where the remaining three signatures live); `cloudflare:index:WorkersScript mattbutlerengineering-edge-router` → `~ updated` confined to `content` (a diff touching `bindings`, `scriptName`, `mainModule` or `compatibilityDate` is not expected); `cloudflare:index:WorkersScript mattbutlerengineering-gen` → `unchanged`; `auth0:index:Client mattbutlerengineering-hospitality` → the known `sso` oscillation; the other 12 → `unchanged`.
  - Accept: every one of these seven rules is recorded, or the item is not done:
    1. **`App: unchanged` → FAIL, unconditionally** — most of all when other resources did change. It is the original defect's exact signature, and no combination of other rows redeems it.
    2. **`edge-router: unchanged` → FAIL.** The measured baseline says that bundle is byte-reproducible, so an absent diff means it does not carry the edge change and the preview evaluated the wrong worker. Confirm the row **positively** from 4.1(h)'s fingerprint — `originRoutes` occurs at least once in the bundled file, and the `sha256sum` is recorded so a later run can tell whether the same bundle was read — not from the opaque `~ content` diff alone. A passing App row does not redeem it: the gates are in series, and either one shut leaves the surface just as dead.
    3. **A `mattbutlerengineering-gen` diff is a finding, not build noise.** Enumerate it, and treat the `edge-router` row as suspect for the same reason: the likeliest cause is the carrier's build env diverging from `pulumi-up.yml`'s (4.1(g)), which means the preview is not reading the artifacts it claims to.
    4. **`auth0:index:Client mattbutlerengineering-hospitality` gets a named verdict that counts neither for nor against this run** — known permanent `sso` oscillation, unrelated drift, never allowed to dilute the App verdict.
    5. **Every resource appearing in the plan gets a named verdict, and any diff outside the two expected ones is enumerated by name for `release.md`.** "Only ingress changed" is admissible as an enumeration and inadmissible as an impression — an unread row is how a dead surface passes for a live one. "Resources changed" is not a verdict.
    6. **The baseline is re-checked before the table is trusted.** Rows 2–4 hold only while the most recent `pulumi-up` still reports `Resources: ~ 1 updated, 15 unchanged` with App, `gen` and `edge-router` merely `refreshing` (measured on run 32775514049, `a458f266`, 2026-08-24T20:43:35Z). Nothing in this repo goes red when that baseline moves, so record which run was checked and when.
    7. **Nothing is applied** — the run's job list contains no `up`, and the App
       ingress rule reaches production only via `release.md`'s steps, which this
       run does not execute.
  - Blocked by: 4.3, 4.4

- [ ] **4.6 Reconcile the deferred-reconciliation seed with issue #3277** — `docs/backlog.md` already carries the seed line as an uncommitted working-tree change (`git diff docs/backlog.md`, verified 2026-08-24); open issue #3277 (`Narrow Pulumi ignoreChanges to drift-tolerant paths`, `ready-for-human`) covers overlapping ground.
  - Accept: the overlap is resolved one way and the choice is recorded in `release.md` — either the seed line references #3277 and is committed on the fix branch, or the seed is dropped in favour of the issue and #3277 is updated to note what this run narrowed and what it deliberately left ignored (`spec.jobs`, `spec.services`). Not both, and not silently neither. The seed does **not** ride the 4.2 merge; it lands on `main` only when the fix does.
  - Blocked by: —

---

## Coverage map

Every exit criterion in `defect.md` § Notes, and every component in
`architecture.md`, traced to where it is satisfied. An architecture component
with no item, or a criterion with no checkbox, is a hole in this breakdown.

| Exit criterion (`defect.md`)                                                                     | Where it is met                                                                                    |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1. A real preview whose diff shows the `/public` ingress rule being added, read and recorded     | 4.5 (needs 4.1–4.4)                                                                                |
| 2. No unintended spec changes beyond ingress and the ignored DO defaults, or they are enumerated | 4.5 level-2 table, rules 3 and 5                                                                   |
| 3. `ingress-coverage.test.ts` is no longer vacuous                                               | 1.1 + 1.2 + 1.3 (all three; any one alone leaves it vacuous in the other's direction)              |
| 4. `release.md` records the exact apply steps and nothing is applied                             | **Ship stage, not a work item.** 4.5's per-resource enumeration and 4.6's decision are its inputs. |
| Revision: both gates covered                                                                     | Milestone 2 (DO) + Milestone 3 (edge); neither alone satisfies the run                             |

| Architecture component                                                                             | Item(s)                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| App change-management policy (`index.ts` `ignoreChanges`)                                          | 2.1                                        |
| Edge topology registry (`routes-config.json` + `edge-router.js`)                                   | 3.1, 3.2 (+ 3.3 ADR amendment)             |
| Source-coupling check — assertion A                                                                | 1.2                                        |
| Source-coupling check — assertion B                                                                | 1.1                                        |
| Source-coupling check — assertion C                                                                | 1.3                                        |
| Production reachability probe — engine additions (`origin`, `expectBodyIncludes`, `wrong-service`) | 1.4                                        |
| Production reachability probe — the two probes                                                     | 1.5                                        |
| Preview carrier (`pulumi-preview.yml`)                                                             | 4.1, 4.2, 4.5                              |
| Precondition P1 (depth-2 paths honored)                                                            | settled only by 4.5; explicitly NOT by 2.1 |
| Precondition P2 (preview needs a carrier that must be merged)                                      | 4.2                                        |
| Precondition P3 (no deploy in flight)                                                              | 4.4                                        |

## Design gaps found

Both gaps were routed back and **both are now closed by Architect**
(`architecture.md` 2026-08-24 amendment). The original text is kept below so the
gap and its resolution stay re-derivable together; the resolution line records
what it resolved to and where the answer now lives.

- **G1 (material) — the preview's verdict contract stops at `digitalocean:index:App`.**
  `architecture.md` § _Interfaces & contracts_ enumerates four failure modes,
  all of them properties of the App resource, and its _pass_ signature reads
  "exactly one `~ digitalocean:index:App` update". But the edge half of this
  same run necessarily produces a second diff, on
  `cloudflare:index:WorkersScript mattbutlerengineering-edge-router`
  (`index.ts:283` inlines the bundled worker as `content`), and the preview
  workflow must build `apps/gen/dist` before the program evaluates at all,
  which can produce a third on
  `cloudflare:index:WorkersScript mattbutlerengineering-gen`. So "the preview
  is not clean" is now the _expected_ state, and a reader who takes "resources
  changed" as success while `App` says `unchanged` reproduces this run's own
  defect — a green signal over a dead surface. Missing from the architecture:
  the expected `WorkersScript` signature, and the verdict when `App` is
  `unchanged` but other resources are not. Item 4.5 applies the existing
  four-signature contract _per resource_ and hard-fails on `App: unchanged`,
  which is the narrowest reading that stays inside the design — but Architect
  should pin the `WorkersScript` expectation rather than leave it to the
  reader.
  - **CLOSED — resolved to a two-level verdict contract, and the frame was
    corrected.** Architect added § _Preview → reader: the per-resource verdict_:
    a preview-level outcome first (where _rejected_ lives, since an unparseable
    path aborts before any row exists), then one verdict per resource from a
    named table over all 16 stack resources, grounded on measured baseline
    `pulumi-up` run 32775514049 (`a458f266`, 2026-08-24T20:43:35Z,
    `Resources: ~ 1 updated, 15 unchanged`). This stage's proposed reading —
    "apply the four signatures per resource" — was **rejected as a category
    error** and is not defended here: _silent no-honor_ is a property of
    `ignoreChanges`, which only the App carries, and _rejected_ is preview-level.
    The hard-fail on `App: unchanged` survives as rule 1. Three things the
    original 4.5 did not carry are now folded in: `edge-router: unchanged` is
    **also** a hard FAIL (the bundle is byte-reproducible, so no diff means the
    wrong worker was read), a `mattbutlerengineering-gen` diff is a **finding**
    rather than the "possibly a third resource" 4.5 had hedged, and
    `auth0:index:Client` gets a named verdict for a known permanent oscillation
    that never counts either way. Two new obligations landed on the carrier and
    are now in **4.1(g)** (build-env parity with `pulumi-up.yml:52-59` / `:61-67`)
    and **4.1(h)** (bundle fingerprint), both read-only.
- **G2 (minor) — origin-prefix matching semantics unspecified.**
  `architecture.md` says `edge-router.js` reads `originRoutes` "in place of the
  hardcoded `url.pathname.startsWith("/api/")` test" without stating how a
  registry prefix matches a path. `startsWith(prefix)` alone would newly proxy
  `/apiary` and `/publicity` to the origin. Item 3.2 preserves today's
  exact-or-slash semantics and pins them with a boundary test; Architect should
  confirm that is the intended registry contract, since `staticRoutes`
  prefixes in the same file are matched by different code.
  - **CLOSED — confirmed, not changed.** Architect specified exact-or-slash as
    `s === p || s.startsWith(p + "/")`, matched on `url.pathname` only (query
    excluded), case-sensitive, with `originRoutes` order explicitly **not**
    significant (one boolean branch, so the array is a set — no entry can shadow
    another). Item 3.2's criteria now pin the case-sensitivity, the query
    exclusion, and the order-insignificance as tests rather than prose. The
    convergence question this gap raised was also answered: `staticRoutes` keeps
    its own looser matcher as a **deliberate non-goal**, because the two tables
    mean different things (mount point, stripped vs. path segment, forwarded
    verbatim), one is total and one is partial, and tightening the static side
    would change what `/hospitality-anything` returns today — a live behavior
    change on a surface this run has no defect against.
- **Resolved by measurement, not routed — the probes' `requireHeaders`.**
  `architecture.md` specifies the two probes' host, path, status and
  `expectBodyIncludes` but not their required headers, while the existing unit
  test mandates every probe declare one. Resolved in favour of keeping
  `x-ratelimit-limit` after measuring on 2026-08-24 that the Cloudflare edge
  preserves it on a proxied response and that `public-venues.ts` declares no
  route-level `config.rateLimit`. Recorded here so the basis is re-derivable;
  no Architect decision needed.

## Notes

- **Sequencing hazard for whoever eventually merges (belongs in `release.md`).**
  Item 1.5's probes must not reach `main` before the apply. `post-deploy-check.yml`'s
  `API Surface Invariants` job runs `check-api-surface-invariants.mjs` after
  every successful `Deploy Services`, `Deploy Static Sites` and `Pulumi Deploy`
  on `main`, and files an issue on breach with a per-SHA dedupe key — so
  merging red probes onto a still-broken production files a **new** issue on
  every deploy until the apply lands. The safe order is: apply, confirm the
  probes pass against live hosts, then merge. A gate that cries on every deploy
  gets muted, which is the same end state as no gate.
- **Both halves apply in the same `pulumi up`.** `pulumi-up.yml` bundles
  `edge-router.js` into `infrastructure/worker/dist/` and `index.ts` uploads it
  as a `WorkersScript`, so there is no separate edge deploy to schedule. One
  apply opens both gates; a partial apply opens neither usefully.
- **The local checkout was stale while this artifact was written** (`HEAD`
  `0f34b4848`, `origin/main` `e6491b000`). Every source citation above was read
  via `git show origin/main:<path>`, per the standing correction in memory.
  Implement should reset to `origin/main` before branching.

### Implement-stage deviations and findings (2026-08-24)

Milestones 1–3 only. Milestone 4 was deliberately withheld from this stage
(the run's single authorized merge and the live `pulumi preview` dispatch),
so every item below stops at source level on the unmerged branch
`fix/public-ingress-two-gates`.

**Milestone 1 verdicts, recorded verbatim** (`node scripts/check-api-surface-invariants.mjs
--retries 0`, live production, 2026-08-24). Exit code 1. The five pre-existing
probes were unaffected and all reported `ok`:

```
{"name":"public-venue-lookup:reachable-at-origin","request":"GET https://api.mattbutlerengineering.com/public/v1/venues/surface-probe-absent-venue","expectStatus":404,"httpCode":404,"guards":{"x-ratelimit-limit":null},"state":"wrong-service"}
{"name":"public-venue-lookup:reachable-through-edge","request":"GET https://mattbutlerengineering.com/public/v1/venues/surface-probe-absent-venue","expectStatus":404,"httpCode":200,"guards":{"x-ratelimit-limit":null},"state":"status-mismatch"}
```

Both are RED **by design** per this file's assumption 5 — they can only pass
after a `pulumi up`, which prepare-and-stop forbids. Two different verdicts for
two different reasons, which is the signal: at the origin the DO ingress gate
is shut (the 404 body is the Fastify route-miss, not `Venue not found`); at the
apex the edge gate is shut (200 `text/html`, the marketing SPA). Do not
"fix" the classifier to collapse them into one state.

**Deviation — assertion A cannot be literally "every served prefix, both
gates"; the edge side needs a named exemption.** `architecture.md` §
_Source-coupling check_ A says every registered prefix must have both a DO
ingress rule and an `originRoutes` prefix, while § _Components_ fixes
`originRoutes` at `["/api", "/public"]`. Those two statements are inconsistent
against real code: `servedPaths()` also yields `/v1/sessions`,
`/v1/orchestrate` and `/v1/webhooks` (agent-api), which DO ingress routes but
the edge does not forward. Resolved in favour of the measured
`originRoutes` value, because adding `/v1` would change what three live apex
paths return (they serve the marketing SPA today) — a behavior change this run
has no defect against and the architecture itself forbids. The exemption is an
explicit, commented `EDGE_EXEMPT_PREFIXES = ["/v1"]` constant, guarded by its
own test that fails if the list ever grows to cover `/api` or `/public`.

**Deviation — item 2.1's "test 1.1 goes green with no further edits to the
test" held for the _assertion_, not for its _reader_.** Writing the new
`ignoreChanges` comment (which records the old `["spec"]` value as the defect's
history) made the raw-text reader match the comment instead of the code, so 1.1
stayed red over a correct fix. The reader now strips whole-line comments and a
test pins that it reads the live array; the assertion itself is unchanged and
unweakened. Logged because it is the same failure class the run is about: a
check reading a claim about the code rather than the code.

**Finding — proxying a prefix does NOT rate limit it, and `architecture.md`
says it does.** § _Components § Edge topology registry_ states the circuit
breaker, rate limiter, forwarded headers and path preservation "all come along
unchanged because the branch is the same branch". True of everything except the
rate limiter: it runs _before_ the origin branch and is keyed by
`rate-limiter.js`'s own `RATE_LIMITS` table. Measured after item 3.2 landed —
`/api/v1/venues` → `{allowed:false, limit:100}`, `/public/v1/venues/x` →
`{allowed:true, limit:-1}`. So item 3.2 made an unauthenticated guest surface
newly reachable at the edge with no edge bound. Origin-side bounds still
applied (`@mbe/service-bootstrap`'s service-wide 100/min plus
`publicRateLimitHook`), so this was missing edge shedding rather than an
unbounded endpoint. Fixed in the same milestone: `/public/` takes the same
100/min as its `/api/` sibling (no invented number), and
`rate-limiter.test.js` now asserts every `originRoutes` prefix has an edge
limit so the next prefix added cannot repeat it.

**Not fixed, flagged (pre-existing, out of scope):**

- An _exact_ origin path is unbounded at the edge for both prefixes: `/api`
  and `/public` do not match the `"/api/"` / `"/public/"` `startsWith`
  patterns. Pre-existing for `/api`; both 404 at the origin and are still
  covered by the origin-side limiter.
- `rate-limiter.js`'s table is itself hardcoded topology of the kind ADR-011
  bans in `edge-router.js`. Deriving its origin entries from `originRoutes` is
  the same move item 3.2 made one file over, but it would also change how
  `/api/flags/` and `/health/system` are handled — a separate run.
- The now-reachable public routes return ad-hoc `{ success: false, error }`
  envelopes (`services/reservations/src/routes/public-venues.ts:39`,
  `public-guest-risk.ts:46,54`, `public-guest-recognition.ts:47,56`) where
  ADR-002/ADR-008 mandate RFC 7807 `createProblemDetails()`. Pre-existing code
  that this run puts in front of guests for the first time; worth a follow-up
  issue. Note item 1.5's probes are unaffected by an eventual migration — the
  `Venue not found` string is the problem-details `detail` in `availability.ts`
  already.
