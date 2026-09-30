---
stage: verify
run: feature:ui-quality-loop
date: 2026-09-30
part: 2a — every criterion except SC-3's calibration verdict
assumptions:
  - "SC-1's `record` + `coverage` run used a HAND-BUILT `.ui-quality/judge-status.json` that marks every captured route `judged` — it simulates the judge, which part 1 did not run over the repo's routes. It proves the ledger arithmetic on real manifest rows (40 captured, 18 unreachable:auth), not that the judge would have judged all 40. Ran against a scratch copy of the ledger (`--root` in the scratchpad); the committed ledger was never written by it."
  - "The part-1 ledger state (`metrics/ui-quality-ledger.jsonl` with 18 `unreachable:auth` marks written by `ledger.mjs due`) is local-pass state, not a fire's committed result: it was copied into the SC-1 scratch root first, then reverted with `git checkout -- metrics/ui-quality-ledger.jsonl` before any gate ran."
  - "SC-2's P1 check was exercised on a fixture issues JSON (#9001 8 days old, #9002 6 days old, #9003 no createdAt) whose titles are built in the loop's own `titleFor()` shape with real rubric tell ids — 'reads the loop's own filings' is shown on filings in the loop's format, since the loop has filed nothing yet."
  - "SC-6's second pass simulates the first pass's execution: its 3 creates were given issue numbers 90001–90003 and recorded `open` in the issue-states map, and its 13 seeds were appended to a scratch copy of `docs/backlog.md` via `findings.mjs seeds`. The committed `metrics/ui-quality-findings.json` and `docs/backlog.md` were never touched."
  - "SC-7's scripts suite was run green with the COMMITTED `docs/ui-quality/calibration.json` (the placeholder the 2 `committed calibration.json placeholder` tests pin). The unlabelled 12-pair working copy was set aside and restored byte-for-byte (sha256 `346108cd…2e05afa` before and after); with it in place the same suite shows exactly those 2 reds, which is expected until the one-time labels land."
  - "SC-4's VR specs cover the ledger's `page` rows only (architecture § VR floor: 'enumerate the ledger's `page` rows'); the `*` not-found rows (marketing, hospitality) are audited by the routine but not snapshotted. Read here as the architecture's narrowing of the PRD's 'every route the ledger marks reachable', not as a gap — Review may disagree."
  - "`browser.mjs resolve`'s exit-3 behaviour is shown by its unit tests (no sandbox without a browser was available locally); locally it resolves to the Playwright headless shell and exits 0."
---

# Verification: A UI-quality loop that keeps every page at a professional bar

## Summary

**6 PASS, 0 FAIL, 1 PENDING (SC-3 — human labels).** Every mechanical
criterion is demonstrated on real rows from part 1's bounded local pass, and
every gate is green. What remains is the one human touch the PRD designs in:
Matt labels the 12 calibration pairs once, the rater judges them, and
`rate.mjs calibrate` prints the N-of-M verdict. Three items are Ship-owned by
design and noted per criterion (label bootstrap, Linux baselines, trigger id).

| Criterion                 | Result                         | Key evidence                                                                                                                        |
| ------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| SC-1 Coverage             | PASS                           | `generate` ×2 → same sha256 `5bf0bac7…`; `check` exit 1 on removed/added row; `coverage --json` 40/132 = 30.3 %                     |
| SC-2 Correctness          | PASS (label create is Ship's)  | `p1-age.mjs` → `2 of 3 open P1 issue(s) older than 7 days`, exit 1; 6-day-only → exit 0                                             |
| SC-3 Taste                | **PENDING — human labels**     | `calibration-status` exit 3 `stale`; validator lists only the 12 missing `human_prefers` + the labelled_at/by pair                  |
| SC-4 VR floor             | PASS (baselines are Ship's)    | specs list 12 + 38 tests; noise-floor 36684428015 / 36684419917 `"verdict": "ok"`; full-path wiring tests green                     |
| SC-5 No human in the loop | PASS (first fire is Operate's) | routine-prompt test 18/18 incl. `never uses gh or the live site`; prompt greps for `gh ` / live host exit 1                         |
| SC-6 Convergence          | PASS                           | pass 1 `create 3, 13 seed(s)`; pass 2 `skip 16, 0 seed(s)`                                                                          |
| SC-7 Gates                | PASS                           | scripts 4461 passed; 5 packages lint/typecheck/test exit 0; regen --check, repo-audit 32/32; drift reviewer FLAG (5 should-fix/nit) |

## Part 1 measurements (the first measurement of one fire)

From the bounded local pass (orchestrator part 1, `.ui-quality/` evidence
reused here — no routes were re-captured):

- Wall-clock: ~110 s for capture + mechanical detection with cached builds.
- Due set: 40 routes (hospitality 2 / marketing 7 / rialto-web 31) — exactly
  `MAX_ROUTES_PER_FIRE`; 18 hospitality rows marked `unreachable:auth`
  (`.ui-quality/due.json`: `due 40 unreachable_auth 18 at 2026-09-30T08:16:01Z`).
- Captured 40/40; every fold is 1280×720 (re-checked here from PNG headers:
  `manifest rows: 40 folds not 1280x720: 0 []`).
- Mechanical findings after fix `a71acdfb7`: 16, 0 P1 — 12
  `accessibility/axe-serious`, 3 `accessibility/axe-moderate`, 1
  `bugs/failed-request` (marketing `/status`, `/api/v1/users/health` → HTTP 502
  from the local preview, which has no API behind it).
- The judge (taste rater over repo routes) was **not** run in part 1, so the
  token/cost of a judged fire is still unmeasured — see Not verified.

## Criteria & evidence

### SC-1 Coverage

- Check: drift check on the committed ledger; `generate` twice on the same
  commit; hand-edit and stale-row detection (edits reverted with
  `git checkout`); `ledger.mjs record` + `coverage.mjs --json` on a scratch copy
  holding part 1's post-`due` ledger, `due.json`, the 40 manifests and a
  hand-built judge-status (simulated judge — see assumptions); `coverage.mjs`
  on the committed ledger.
- Evidence:

  ```
  $ node scripts/ui-quality/ledger.mjs check
  PASS: ui-quality ledger matches the route inventory (154 rows)
  check exit=0
  $ node scripts/ui-quality/ledger.mjs generate   (twice)
  ledger.mjs generate: 154 rows (git_depth: full)
  5bf0bac70d1b36e3cba2e9769a1ca634f1d71c57d732c1d674ae58c0721e5d62  metrics/ui-quality-ledger.jsonl
  ledger.mjs generate: 154 rows (git_depth: full)
  5bf0bac70d1b36e3cba2e9769a1ca634f1d71c57d732c1d674ae58c0721e5d62  metrics/ui-quality-ledger.jsonl
  git diff --quiet -- metrics/ui-quality-ledger.jsonl → exit 0

  # line 5 deleted (stale ledger)
  FAIL: ui-quality ledger is stale — run: node scripts/ui-quality/ledger.mjs generate
    added:   hospitality booking-widget
  check(stale row removed) exit=1
  # hand-added row
  FAIL: ui-quality ledger is stale — run: node scripts/ui-quality/ledger.mjs generate
    removed: marketing hand-edit
  check(hand-added row) exit=1

  $ node scripts/ui-quality/ledger.mjs record --root <scratch>
  ledger.mjs record: {"due":40,"audited":40,"unreachable":{"auth":18,"build":0},"unjudged":0,"dropped_tells":0}
  record exit=0
  <scratch>/metrics/ui-quality-runs.jsonl:
  {"ts":"2026-09-30T14:05:35Z","due":40,"audited":40,"unreachable":{"auth":18,"build":0},"unjudged":0,"dropped_tells":0,"git_depth":"full","rubric_version":1}

  $ node scripts/ui-quality/coverage.mjs --json --root <scratch>
  { "percent": 30.3, "provisional": true, "first_run_at": "2026-09-30T14:05:35Z",
    "covered": 40, "denominator": 132,
    "uncovered": [ "rialto-web components/flip-dot", … 92 rows … "rialto-web visual-test" ],
    "unjudged": {},
    "unreachable": { "unreachable:auth": [ "hospitality *", "hospitality /", "hospitality admin",
      … 18 rows … "hospitality waitlist" ] } }
  coverage exit=0

  $ node scripts/ui-quality/coverage.mjs        # committed ledger
  PROVISIONAL: ui-quality coverage 0 % (0/150 reachable routes audited in the last 30 days) — no fire recorded yet; binding 30 days after the first run
  coverage exit=0
  ```

  154 rows = 150 auditable (page | not-found) + 4 redirects (never due). The
  scratch denominator 132 = 150 − 18 `unreachable:auth`, which are reported
  separately by reason, as SC-1 asks. The committed ledger reads 0 %, never
  100 %, with no runs row.

- Result: **PASS** (the 30-day binding figure is Operate's, per the PRD).

### SC-2 Correctness

- Check: label bootstrap printout; deterministic titles (`titleFor()` in
  `scripts/ui-quality/findings-plan.mjs`); `p1-age.mjs` on a fixture of 3 open
  `ui-quality:p1` issues in the loop's title format; live label state.
- Evidence:

  ```
  $ node scripts/ui-quality/labels.mjs print-bootstrap
  gh label create "ui-quality" --color 5319e7 --description "Found by the daily ui-quality routine" --force
  gh label create "ui-quality:p1" --color b60205 --description "ui-quality P1: fix within 7 days" --force
  gh label create "ui-quality:p2" --color fbca04 --description "ui-quality P2: filed within the per-fire budget" --force
  exit=0

  titleFor(): `ui-quality: ${finding.app} ${finding.route} — ${finding.tell} (rubric v${version})`

  $ node scripts/ui-quality/p1-age.mjs --issues p1-issues.json --now 2026-09-30T00:00:00Z
  BREACH #9003 open an unknown age: ui-quality: rialto-web components/dialog — accessibility/axe-critical (rubric v1)
  BREACH #9001 open 8 days: ui-quality: hospitality book/:venueSlug — bugs/blank-render (rubric v1)
  2 of 3 open P1 issue(s) older than 7 days
  p1-age exit=1
  $ node scripts/ui-quality/p1-age.mjs --issues p1-issues-fresh.json --now 2026-09-30T00:00:00Z   # #9002 only (6 days)
  0 of 1 open P1 issue(s) older than 7 days
  p1-age(6-day only) exit=0

  $ gh label list --search ui-quality --limit 10
  (no output)  exit=0
  ```

  The 8-day issue breaches, the 6-day one does not, and the one with no
  `createdAt` fails closed as a breach.

- Result: **PASS** for everything Implement owns. The labels do not exist on
  the repo yet (empty `gh label list`); creating them is Ship's step, before
  the first fire (architecture § Labels — the sandbox has no label API).

### SC-3 Taste — partial (everything except the verdict)

- Check: reference-set provenance tests; the rater's record/calibrate
  contract tests; `calibration-status` on the unlabelled set;
  `validateCalibrationSet` on the unlabelled set.
- Evidence:

  ```
  $ vitest run scripts/__tests__/ui-quality-references.test.mjs
  ✓ committed OSS reference set > has at least 5 references
  ✓ committed OSS reference set > records every provenance field on every reference
  ✓ committed OSS reference set > points every `file` at a committed 1280×720 PNG whose sha256 matches
  ✓ committed OSS reference set > uses only permissive licenses and names no proprietary product
  ✓ committed OSS reference set > covers every non-harness rubric category at least once
  ✓ committed OSS reference set > every committed reference PNG is exactly 1280×720 by its header (png.mjs)
  ✓ committed OSS reference set > validates clean
  ✓ committed OSS reference set > mirrors its ids, in order, into rubric.json references[]
  … 4 referenceErrors cases ✓
  Tests  12 passed (12)

  rubric.json references (8): shadcn-home, mantine-home (marketing-site); medusa-product,
  medusa-checkout (booking-checkout); shadcn-dashboard-01, tremor-overview (product-dashboard);
  mantine-button-docs, chakra-button-docs (component-docs)

  ui-quality-rate.test.mjs (selected):
  ✓ record appends one row per app with the score, the --model-id, every pair
  ✓ never writes an absolute single-answer score field
  ✓ the appended record carries set_sha256 = sha256 of calibration.json's bytes, model_id and rubric_version
  ✓ an empty labelled set exits 2 and records nothing — never passes on no data

  $ node scripts/ui-quality/rate.mjs calibration-status --model-id claude-opus-5
  {"key":{"model_id":"claude-opus-5","rubric_version":1,"set_sha256":"346108cd89d215942390a9b2828d556b111ba3c3d163d69656cf769ba2e05afa"},"status":"stale","agreement":null,"inversions":null,"pass_mark":{"agreement":0.8,"inversions":0}}
  calibration-status exit=3

  validateCalibrationSet(docs/ui-quality/calibration.json):
  pairs: 12 labelled_at: null labelled_by: null
  distinct ours: 6 distinct refs: 6
  13 problem(s):
   - docs/ui-quality/calibration.json: a labelled set needs labelled_at and labelled_by
   - calibration pair 0: human_prefers must be ours|reference
   … pairs 1–10 identical …
   - calibration pair 11: human_prefers must be ours|reference
  ```

  The only problems left are the labels themselves: composition (12 pairs, 6
  ours from this repo's routes, 6 references) already passes the ≥ 10 /
  ≥ 5 / ≥ 5 floor.

- Result: **PENDING — human labels.** The N-of-M agreement and the
  disagreement list cannot exist until Matt labels the 12 pairs.

### SC-4 VR floor

- Check: `playwright test --list` on both visual configs; ledger rows vs listed
  tests; `apps-visual.yml` invocations; workflow-coverage tests; noise-floor
  runs and their tolerance verdicts; baseline state.
- Evidence:

  ```
  $ (apps/marketing) pnpm exec playwright test --config playwright.visual.config.ts --list
  [chromium] › visual.spec.ts:60:5 › / @ 1280x720        … / acmm / ai-health / metrics / status / weekly × {1280x720, 375x812}
  Total: 12 tests in 1 file
  $ (apps/hospitality, E2E_AUTH0_* set to dummy values — listing only, no auth executed)
  [setup] › auth.setup.ts:18:1 › authenticate via Auth0
  [chromium] › visual.spec.ts:70:5 › / @ 1280x720  … 19 page routes × 2 viewports (admin, book/:venueSlug, booking-widget,
    briefing, chat, dashboard, floor-plans, floor-plans/:id, guests, onboarding, profile, reservations,
    reservations/manage, settings, setup, setup/hours, timeline, waitlist, /)
  Total: 39 tests in 2 files
  (without the env vars the listing aborts in auth.setup.ts: "Missing required E2E auth env vars" — CI holds them)

  ledger page rows: marketing 6 (/, acmm, ai-health, metrics, status, weekly); hospitality 19 — all listed.

  .github/workflows/apps-visual.yml:112: pnpm exec playwright test --reporter=github,json --config apps/marketing/playwright.visual.config.ts apps/marketing/e2e/visual.spec.ts
  .github/workflows/apps-visual.yml:224: pnpm exec playwright test --reporter=github,json --config apps/hospitality/playwright.visual.config.ts apps/hospitality/e2e/visual.spec.ts
  .github/workflows/apps-visual.yml:187,297: node scripts/publish-visual-diffs.mjs

  ✓ e2e/workflow-coverage.test.ts > marketing e2e workflow coverage > apps-visual.yml names visual.spec.ts by its full path
  ✓ e2e/workflow-coverage.test.ts > hospitality visual workflow coverage > apps-visual.yml names visual.spec.ts by its full path
  (marketing 2 passed, hospitality 6 passed)

  $ gh run view 36684428015   # marketing
  {"conclusion":"success","headBranch":"feat/ui-quality-loop","headSha":"b7de78505d63…","jobs":[capture (replica-a|replica-b|perturbed), analyze — all success]}
  analyze:   "verdict": "ok",   "maxDiffPixels": 300
  apps/marketing/playwright.visual.config.ts: // noise-floor: run 36684428015 · ubuntu24 20260920.314.1 · playwright 1.63.0
                                              // noise-floor-values: threshold=0 maxDiffPixels=300
  $ gh run view 36684419917   # hospitality
  {"conclusion":"success","headBranch":"feat/ui-quality-loop","headSha":"b7de78505d63…", same 4 jobs all success}
  analyze:   "verdict": "ok",   "maxDiffPixels": 3583
  apps/hospitality/playwright.visual.config.ts: // noise-floor-values: threshold=0 maxDiffPixels=3583

  $ ls apps/marketing/e2e/screenshots apps/hospitality/e2e/screenshots
  No such file or directory (both)
  $ gh run list --workflow apps-visual.yml --branch feat/ui-quality-loop
  HTTP 404: workflow apps-visual.yml not found on the default branch
  ```

- Result: **PASS** for Implement's scope. **Baselines are Ship-owned and not
  committed**: Ship commits them from the `visual-actuals-replica-a` artifact
  of a noise-floor run (Linux, provenance recorded). Until then `apps-visual`
  will be **red** on the PR (every snapshot missing) — expected, and advisory
  (not in `ci-gate`'s needs). It has not run yet at all: it only exists on this
  branch, and no PR is open.

### SC-5 No human in the loop

- Check: routine-prompt, routine-liveness and browser tests; greps over the
  prompt's fenced block; local `browser.mjs resolve`.
- Evidence:

  ```
  $ vitest run --config scripts/vitest.config.mjs ui-quality-routine-prompt / routine-liveness / ui-quality-browser
  ✓ docs/routines/mbe-ui-quality.md > exists with house frontmatter and a fenced text prompt
  ✓ … > invokes every scripts/ui-quality CLI by a file that exists and a subcommand its usage lists
  ✓ … > makes exit 3 (stale) the only calibration trigger and never re-runs a failed key
  ✓ … > never uses gh or the live site
  ✓ … > names a ledger PR title the manifest signature matches
  ✓ docs/scheduled-tasks.md — mbe-ui-quality > catalogues the routine with a pending trigger and its prompt file
  ✓ classifyRoutineLiveness — activatedAt grace (ui-quality-loop) > is pending when activated 1 day ago with periodDays 1 and no artifact matched
  ✓ … > is dark once activatedAt is 3 days old with periodDays 1
  ✓ browser.mjs resolve > exits 3 when no candidate launches, naming what it tried
  ✓ browser.mjs resolve > exits 3 when there is no candidate at all
  Test Files  3 passed (3)
       Tests  87 passed (87)
  vitest exit=0

  $ grep -nE '(^|[^a-z-])gh ' prompt.txt            → exit 1 (no match)
  $ grep -nE 'mattbutlerengineering\.com|https?://[a-z]' prompt.txt → exit 1 (no match)
  prompt.txt:4: - GitHub only through the MCP tools (load schemas with ToolSearch, …)
  prompt.txt:5: - Never fetch the live site or any production URL (no egress, issue #2920). Everything you judge is a local `vite preview` of this checkout's build.
  prompt.txt:7: - At most ONE fix PR per fire. Never merge a PR, never enable auto-merge.
  prompt: (2) Browser. `node scripts/ui-quality/browser.mjs resolve`. … Exit 3 means nothing launches in this
          sandbox: record `blocker: no-browser` for the log entry and skip straight to (7).
  prompt (7b): Append a dated entry to `.claude/improvement-loop/log.md` … A fire with no findings or no browser says exactly that

  $ node scripts/ui-quality/browser.mjs resolve    # local
  /Users/mbutler/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell
  exit=0

  docs/routines/mbe-ui-quality.md frontmatter: trigger_id: pending · environment_id: env_012GDG167Tpz55u8MEpDkL2y
    · cron: "23 7 * * *" · model: claude-opus-5 · cadence: Daily 12:23am PT
  scripts/routine-manifest.mjs: name "mbe-ui-quality", signature { type: "pr-title",
    pattern: chore\(ui-quality\): ledger \d{4}-\d{2}-\d{2} }
  ```

  Auth-gated rows land as `unreachable:auth`, never skipped: 18 of 18 due
  hospitality `auth0` page/not-found rows in part 1's `due.json` and the SC-1
  coverage output.

- Result: **PASS** for what can be shown before a fire. `trigger_id: pending`
  and the manifest's `activatedAt` are Ship's; the end-to-end sandbox run is
  the first scheduled fire, read at Operate.

### SC-6 Convergence

- Check: `findings.mjs plan` on part 1's real `.ui-quality/findings.mechanical.json`
  in a scratch root (copies of `metrics/ui-quality-findings.json`,
  `docs/backlog.md`, the rubric), execute its result in scratch, then plan
  again on the unchanged findings at the same rubric version.
- Evidence:

  ```
  --- PLAN 1  (issue-states {})
  findings.mjs plan: no --calibration-status — treated as stale
  findings.mjs plan: create 3, 13 seed(s) → .ui-quality/findings.plan.json
  plan1 exit=0
  creates: hospitality|book/:venueSlug|r1|accessibility/axe-moderate,
           hospitality|reservations/manage|r1|accessibility/axe-moderate,
           hospitality|reservations/manage|r1|accessibility/axe-serious   (P2, carrier issue)
  seeds: 13 (marketing acmm/ai-health/metrics axe-serious, marketing status failed-request, 9 rialto-web)
  plan1 fix_pr_candidate: null

  (simulated execution: creates → #90001–#90003; `findings.mjs seeds` appended 13 lines to the scratch backlog;
   `findings.mjs record` → "16 key(s) in the findings ledger"; issue-states {"90001":"open","90002":"open","90003":"open"})

  --- PLAN 2
  findings.mjs plan: no --calibration-status — treated as stale
  findings.mjs plan: skip 16, 0 seed(s) → .ui-quality/findings.plan.json
  plan2 exit=0
  actions by type: {"skip":16} seeds: 0 fix_pr_candidate: null
  ```

  Second pass: zero creates, zero reopens, zero seeds, no fix PR. The 3-issue
  cap (`MAX_P2_ISSUES_PER_FIRE`) held on pass 1: the other 13 P2s went to seeds.

- Result: **PASS**. The re-verification of `[Audit]` #5270–#5280 is, per the
  PRD, the first real fires' job — not done here.

### SC-7 Gates

- Check: full scripts suite; CLI build; regen drift; repo-audit;
  lint/typecheck/test per touched package; prettier on the run dir;
  `e2e-selector-drift-reviewer` on the new specs; rialto changeset need.
  All exit codes captured directly (no pipes).
- Evidence:

  ```
  # calibration.json set aside (cp -p → scratch), `git checkout -- docs/ui-quality/calibration.json`
  $ pnpm --dir scripts test
   Test Files  234 passed (234)
        Tests  4461 passed | 2 skipped (4463)
  scripts suite exit=0
  # restored:
  346108cd89d215942390a9b2828d556b111ba3c3d163d69656cf769ba2e05afa  docs/ui-quality/calibration.json
  346108cd89d215942390a9b2828d556b111ba3c3d163d69656cf769ba2e05afa  <scratch>/calibration.unlabelled.json

  # with the unlabelled working copy in place (expected until labelling):
   FAIL  ui-quality-rate.test.mjs > committed calibration.json placeholder > ships labelled_at: null and pairs: [] and validates against the schema
   FAIL  ui-quality-rate.test.mjs > committed calibration.json placeholder > calibrate on it exits 2 naming the Verify step
        Tests  2 failed | 4459 passed | 2 skipped (4463)

  $ pnpm build --filter @mbe/cli...        build exit=0   (Tasks: 6 successful, 6 total)
  $ pnpm regen --check                     All generated artifacts are up to date.   exit=0
  $ pnpm repo-audit                        32 of 32 checks passed   exit=0

  packages/test-fixtures  lint 0 · typecheck 0 · test 0   (29 passed)
  packages/agent-core     lint 0 · typecheck 0 · test 0   (1740 passed)
  scripts                 lint 0 · (no typecheck script) · test — see above
  apps/hospitality        lint 0 · typecheck 0 · test 0   (2518 passed)
  apps/marketing          lint 0 · typecheck 0 · test 0   (355 passed)
  apps/rialto-web         lint 0 · typecheck 0 · test 0   (770 passed)

  $ git diff origin/main...HEAD --name-only -- packages/rialto
  packages/rialto/CLAUDE.md          # docs only — no published source, no changeset needed

  $ pnpm exec prettier --check docs/features/ui-quality-loop/
  All matched files use Prettier code style!
  ```

  `e2e-selector-drift-reviewer` (run on both visual specs + configs):
  **FLAG, nothing blocking** — `0 strict-mode, 0 volatile-text, 2 mock-gap,
3 non-determinism`; the specs hold no DOM locators at all. Three findings
  were spot-checked and hold: `grep -c briefing apps/hospitality/e2e/api-mocks.ts`
  → `0`; `apps/marketing/e2e/visual.spec.ts` has no `page.route` / health mock;
  `apps/hospitality/playwright.visual.config.ts` inherits
  `webServer.command: "pnpm --filter @mbe/hospitality dev …"`. Listed under
  § Open findings for Review.

- Result: **PASS**.

## Real UI defects the pass found

Beyond the 16 mechanical findings above, part 1's captures show two real
defects no current tell names (re-checked here from the artifacts):

- **Marketing `/` overflows at 375 px**: `root@375x812.png` is **413×6903**
  (the 375 viewport scrolled horizontally; `acmm@375x812.png` is 375×934 for
  comparison).
- **Marketing nav marks "Home" active on every page**: the `/acmm` fold shows
  "Home" underlined and bold while the ACMM dashboard is rendered.

Neither is filed by this stage — Review/Operate route them (a seed or an
issue), and they are evidence for a rubric tell the mechanical detectors lack.

## Open observation — the fix-PR path is unreachable (breakdown Amendment 3)

Measured: **0 of 16** real findings carry `evidence.file`, and pass 1's
`fix_pr_candidate` is `null`. No detector today emits a source file, so the
"at most one fix PR per fire" path cannot fire on mechanical findings — the
loop files issues and seeds only. This is safe (SC-5 caps fix PRs, it does not
require one) but it means the loop never fixes anything itself. Routed to
Review/Operate as a design question, not a Verify failure.

## Open findings for Review (from `e2e-selector-drift-reviewer`)

None of these fails a PRD criterion, but items 1–3 must be settled **before
Ship commits baselines** — a baseline taken of an error state records the
error as correct.

1. **Should-fix, mock gap** — hospitality `briefing`: `mockApi` has no
   `/api/v1/briefing` route, so the baseline would capture BriefingPage's
   "Couldn't load tonight's briefing." card. Also unmocked:
   `/api/v1/venues/:id/table-statuses`, `/api/v1/sessions`, and
   `/api/v1/reservations/manage?…` (the mock regex cannot match a query
   string).
2. **Should-fix, no mock** — marketing `status`: `/api/v1/*/health` and
   `/api/gen/health` hit a `vite preview` with no backend, so the baseline
   freezes three services "error" (the same 502 part 1's mechanical pass
   filed as `bugs/failed-request`).
3. **Should-fix, flake** — the hospitality visual config inherits the Vite
   **dev** server; a cold dependency optimize can force a reload mid-test.
   Marketing already screenshots a built `vite preview`.
4. **Nit** — the SSE mock sends a finite body, so EventSource reconnects about
   every 3 s under a fixed clock.
5. **Nit** — hospitality `FIXED_NOW` has no `Z` and no `timezoneId` is
   pinned, so rendered times depend on the runner's timezone.

## Failures

None against the PRD's criteria. The drift findings above route to Review.

## Not verified

- **SC-3 verdict** — needs the one-time human labels (below).
- **The judge over repo routes, and its token/cost** — part 1 captured and ran
  the mechanical detectors only; SC-1's judge-status was simulated. The first
  real fire (or the calibration judging below) is the first cost measurement.
- **The hospitality visual spec actually rendering** — listed only; it needs
  the CI Auth0 secrets and has no baselines yet. `apps-visual` has never run.
- **The sandbox end-to-end run** — first scheduled fire (Operate), after Ship
  sets `trigger_id` / `activatedAt` and runs the label bootstrap.
- **The 30-day coverage figure** — binding only 30 days after the first fire.

## Remaining before Review

1. **Matt labels** `docs/ui-quality/calibration.json` once: `human_prefers`
   (`ours` | `reference`) on each of the 12 pairs, `labelled_at`,
   `labelled_by`, and the passing N written into the rubric
   (`pass_mark` currently `{ agreement: 0.8, inversions: 0 }`). The 6 fold
   PNGs under `docs/ui-quality/calibration/` are the "ours" side. This is the
   run's only human touch.
2. **Judge the 12 pairs**: `rate.mjs pairs --calibration` → the model writes
   verdicts → `rate.mjs calibrate --verdicts <file> --model-id <id>`.
3. **Record the verdict** (part 2b): N of M agreeing pairs and every
   disagreement, SC-3 → PASS/FAIL, commit the labelled `calibration.json`
   (the 2 placeholder tests in `ui-quality-rate.test.mjs` change with it).
