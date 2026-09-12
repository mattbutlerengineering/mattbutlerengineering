---
stage: ship
run: maintenance:rialto-web-usage-instrumentation
date: 2026-09-12
assumptions:
  - "No live user. The stage interview was answered from autorun-brief.md and the run's five predecessor artifacts. Every command quoted below was executed in the worktree .claude/worktrees/docs+readme-world-class on branch fix/rialto-web-usage-instrumentation at bdf95bcc7, on 2026-09-12; nothing is transcribed from a prior stage's log, and every claim about #5169 and pulumi-up.yml was re-measured here rather than inherited from Verify or Review."
  - "Prepare and stop (brief § Release authorization). This stage opened a pull request and did nothing else externally visible: no merge, no auto-merge, no deploy, no tag, no npm publish, no `pulumi up`, no `wrangler deploy`, no `doctl`. The release steps in § The release, step by step were WRITTEN and NOT RUN."
  - "The branch was left 6 commits behind origin/main rather than updated. verification.md finding 5 left this to Ship and no skill-supplied default exists, so the decision is logged with its measurement: `git merge-tree --write-tree origin/main HEAD` exits 0 with no conflict lines, a `git merge --no-commit --no-ff origin/main` trial in this worktree reported `Automatic merge went well`, and `pnpm regen --check` on that merged tree answered `All generated artifacts are up to date` — so the llms-drift-on-update-branch gotcha does not await CI here. The trial merge was aborted and the tree confirmed byte-identical. `main` is not a `strict` branch (.claude/rules/gotchas.md § CI, measured 2026-08-17), so a BEHIND PR is mergeable; updating the branch would have been an extra mutation buying nothing this stage could measure."
  - "Pre-flight box `Verification green` is recorded CHECKED WITH ONE NAMED EXCEPTION rather than silently checked or softened. verification.md is 12 PASS, 1 PASS-with-caveat, 1 FAIL; the FAIL is `node scripts/audit-markdown.mjs` exiting 1 on a pre-existing broken link in a file this branch never touched, reproduced on a clean origin/main worktree, and re-measured here as not being a gate on this PR (`check:markdown` is absent from the `repo-audit` chain and only `.github/workflows/docs-audit.yml` runs it). No criterion failed on this run's own code."
  - "Backlog seeds: two were appended (review.md Minor 3 and Minor 5), which is exactly the scope this stage was given. review.md ALSO assigned Minor 1 (the drift guard's unscoped S2 regex) the route `docs/backlog.md` seed, and that seed was deliberately NOT written here — it is named in § Flagged for human review instead, so it is surfaced rather than silently dropped or silently expanded into. Under the pipeline protocol the backlog's producers are Capture and Operate, not Ship; these two appends are an instructed exception, not a new convention."
  - "The rollback plan is written CI-first (revert PR -> merge -> pulumi-up.yml re-applies), per the standing deploy-via-CI-only policy. The direct Cloudflare-dashboard binding removal is named as emergency-only, with its drift consequence stated. Nobody was present to choose a rollback shape."
  - "Tracker: defect.md carries no `intake:` (brief § Tracker policy: no tracker interaction), so this stage closes and creates no issue. #5169 is referenced as a measured blocker only — not adopted, not commented on, not modified."
  - 'The Cloudflare Web Analytics site token `0c3656fe25764d6b891842c8ceb2e718` appears in defect.md and in a docs/backlog.md seed. It is not redacted because it is not a credential: it is the zone-injected beacon''s public site token, served in the HTML of every page to every visitor. `scripts/secret-scan.mjs`''s `scanForSecrets()` over the diff''s added lines returns `{"matched":false,"type":null}`.'
---

# Release: the edge counter is bound — PREPARED, NOT RELEASED

**State in one line.** The `ANALYTICS` binding, the drift guard that catches its
removal, the schema module, the query script, the runbook and the cookie-banner
correction are all on `fix/rialto-web-usage-instrumentation` and open as a pull
request against `main`. **Nothing has been merged, deployed or applied**, and —
separately from this run's authorization — nothing in the Pulumi plan can apply
at all until someone else resolves **#5169**.

**Do not read this PR as an event that produces data.** Merging it queues a
binding. It does not switch the counter on.

## What this PR queues, and what it cannot do

`.github/workflows/pulumi-up.yml` is the only path that applies the binding, and
it runs `refresh` before `up`, in its own step, with no `continue-on-error`:

```
$ grep -n "name: Pulumi\|command: \|continue-on-error" .github/workflows/pulumi-up.yml
1:name: Pulumi Deploy
80:      - name: Pulumi Cancel + Clear Pending Operations
104:      - name: Pulumi Refresh (Sync state with cloud)
108:          command: refresh
123:      - name: Pulumi Up
127:          command: up
```

#5169 is a failure **in that refresh step**, so `Pulumi Up` is skipped and
nothing in the plan is applied — not this run's `ANALYTICS` binding, not the
`/public/` ingress, not the provider bump. Re-measured today, on a run that
started after both Verify and Review finished:

```
$ gh run list --workflow pulumi-up.yml --branch main --limit 5 \
    --json conclusion,createdAt,databaseId,headSha
failure   2026-09-12T22:23:22Z  34722614056  3511f2319
failure   2026-09-12T21:12:36Z  34719291428  a742c4728
failure   2026-09-12T05:50:36Z  34676613113  e929b3d2b
failure   2026-09-12T05:33:08Z  34675873114  7c5516959
cancelled 2026-09-12T05:30:52Z  34675776736  7c5516959

$ gh run view 34722614056 --json jobs --jq '.jobs[] | "\(.name): \(.conclusion)"'
Deploy Infrastructure: failure
Report Deploy Health: success

$ gh run view 34722614056 --json jobs \
    --jq '.jobs[].steps[] | select(.conclusion=="failure") | .name'
Pulumi Refresh (Sync state with cloud)

$ gh issue view 5169 --json number,state,title --jq '"#\(.number) [\(.state)] \(.title)"'
#5169 [OPEN] fix(ci-fix): ciHealth.pass_rate_pct regressed (100 → 94) — Pulumi Deploy failing on Auth0 403 Insufficient scope
```

**The two orphaned Auth0 state records belong to whoever resolves #5169, not to
this run.** They are `auth0:index/branding:Branding` and
`auth0:index/tenant:Tenant` — genuine orphans, present in Pulumi state and in no
source file — and they appear as deletes in any preview taken today, including
the read-only one Verify dispatched. That is an artifact of their being orphans,
not something this branch authored or carries. Whoever owns #5169 chooses
between granting the Auth0 provider `read:branding` / `read:tenant_settings` and
running `pulumi state delete` on the two records; **this run makes no such
recommendation, took no such action, and must not be described as fixing,
carrying or riding on that decision.** The first successful `pulumi up` after
#5169 is resolved will carry whatever the plan holds at that moment, which is
more than this run's binding.

**Also true, and stated once so nobody has to infer it:** the first row in
`edge_requests` cannot exist before that apply, and this run has never once read
the dataset — see § The limitation this run cannot close.

## Pre-flight

Every line below is a command this stage ran on 2026-09-12 in the run worktree,
with its real output. `HEAD` is `bdf95bcc7` throughout.

- [x] **Verification green** — with one named exception. `verification.md`: 12
      PASS, 1 PASS-with-caveat, 1 FAIL. The FAIL is
      `node scripts/audit-markdown.mjs` exiting 1 on
      `packages/rialto-plugin/skills/rialto/SKILL.md:104`, a pre-existing broken
      link in a file this branch never touched, reproduced by Verify on a clean
      `origin/main` worktree. Re-measured here: it is **not a gate on this PR**
      — `check:markdown` is absent from the `repo-audit` chain and the only
      workflow that runs it is the weekly `Docs Audit`. No criterion failed on
      this run's own code, and nothing was edited to make a gate green.
- [x] **No secrets in the diff** — `scripts/secret-scan.mjs`'s `scanForSecrets()`
      over every added line of `git diff origin/main...HEAD` returns
      `{"matched":false,"type":null}`; an independent grep for `sk_live`/
      `pk_live`/`rk_live`/`AKIA`/`ASIA`/PEM headers/JWTs/bearer literals over the
      same lines returns nothing. The only Cloudflare identifiers the diff adds
      are the two env-var **names** `CLOUDFLARE_API_TOKEN` and
      `CLOUDFLARE_ACCOUNT_ID`.
- [ ] **Required configuration exists in the target environment** — **NO, and
      this is deliberate.** The apply needs no new configuration: the Pulumi
      binding is a resource property, not a secret. The _read_ path needs a
      Cloudflare API token carrying **Account · Account Analytics · Read**, and
      **no such token exists anywhere in this repo, in GitHub Actions, or to
      this run.** `docs/SECRETS.md:18` scopes `MBE_CLOUDFLARE_API_TOKEN` to
      "Pages deploys, KV, DNS, Pulumi" and the string "Account Analytics"
      appears nowhere in that file. Provisioning it is release step 6.
- [x] **Migrations / data changes have a tested forward path** — not applicable,
      measured rather than assumed: piping `git diff --name-only origin/main...HEAD`
      through `grep -iE 'migration|prisma'` returns nothing. No schema, no
      migration, no data backfill. The only new data is append-only rows in a
      Cloudflare dataset that does not exist yet.
- [x] **Rollback plan is concrete** — § Rollback plan below, with commands.

### Gates re-run today at `bdf95bcc7`

| gate                                                | result                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                    | `Done in 3.8s`                                                                                                                                                                                                                                                                      |
| `node scripts/agent-core-build-freshness.mjs check` | `{"trusted":true,"state":"fresh",…}`, exit 0 — so `regen --check` ran against a current dist, not the stale-dist trap                                                                                                                                                               |
| `pnpm turbo typecheck --force`                      | `Tasks: 48 successful, 48 total` / `Cached: 0 cached, 48 total` / `36.42s`, exit 0                                                                                                                                                                                                  |
| `pnpm repo-audit`                                   | exit 0 — includes `All matched files use Prettier code style!`, `PASS: wrangler.toml, pulumi/index.ts and analytics-schema.js agree on the Analytics Engine binding (ANALYTICS → edge_requests).`, and `✔ no dependency violations found (2434 modules, 5747 dependencies cruised)` |
| `pnpm regen --check`                                | `All generated artifacts are up to date.`, exit 0                                                                                                                                                                                                                                   |
| `node scripts/check-ai-antipatterns.mjs`            | exit 0 — `OK hardcodedRoutes: 693 (baseline: 693)`, `OK anyType: 291 (baseline: 291)`, `IMPROVED consoleLogs: 711 (baseline: 712)`                                                                                                                                                  |
| `pnpm --dir infrastructure/worker test`             | `Test Files 16 passed (16)` / `Tests 270 passed (270)`                                                                                                                                                                                                                              |
| `pnpm --dir infrastructure/pulumi test`             | `Test Files 2 passed (2)` / `Tests 88 passed (88)`                                                                                                                                                                                                                                  |
| `pnpm --dir scripts test`                           | `Test Files 166 passed (166)` / `Tests 3211 passed (3211)`, including `✓ check-analytics-bindings.test.mjs (14 tests)` and `✓ edge-usage.test.mjs (23 tests)`                                                                                                                       |
| `pnpm --dir apps/rialto-web test`                   | `Test Files 66 passed (66)` / `Tests 767 passed (767)`                                                                                                                                                                                                                              |

The ratchet line is the one worth reading twice. `review.md` Major 2 found the
repo-wide AI-antipattern baseline loosened by +7 for this branch; the fix-up
pass withdrew both deltas at source, and the file is now **byte-identical to
`origin/main`'s copy** rather than regenerated here:

```
$ git show origin/main:metrics/ai-antipattern-baselines.json | shasum -a 1
5320c0c57e64f41524e2ecbef0769e787e44d077  -
$ shasum -a 1 metrics/ai-antipattern-baselines.json
5320c0c57e64f41524e2ecbef0769e787e44d077  metrics/ai-antipattern-baselines.json
```

`consoleLogs` reads `711` against baseline `712` in this worktree only because
the branch predates `scripts/print-drift-signature.mjs` (landed on `main` in
#5309). If `main` moves again before merge and that file changes, **re-take
main's copy verbatim** (`git checkout origin/main -- metrics/ai-antipattern-baselines.json`)
— never run the antipattern script with `--update`.

### The merge ref, measured rather than assumed

CI evaluates the merge of this branch with `main`, not the branch alone, so the
merge was performed in this worktree without committing and then aborted:

```
$ git merge-tree --write-tree --name-only origin/main HEAD; echo "exit=$?"
a884b37dd8081bf67e12fd0853155cb22fd7a60a
exit=0                                   # a tree id and no conflict list

$ git merge --no-commit --no-ff origin/main
Auto-merging docs/backlog.md
Auto-merging llms-full.txt
Auto-merging llms.txt
Automatic merge went well; stopped before committing as requested

$ pnpm regen --check          # on the MERGED tree
All generated artifacts are up to date.
regen-check-on-merged-tree-exit=0

$ git merge --abort
$ git rev-parse HEAD
bdf95bcc79de049beb20c4b648bdb7a5d9eec336
$ git status --short
 M README.md
?? docs/autonomous-loop.svg      # pre-existing worktree dirt, never staged
```

Both sides of the merge touch `llms.txt` / `llms-full.txt` and `docs/backlog.md`,
which is exactly the shape that usually produces the Integrity-job drift this
repo keeps rediscovering. It does not here: the merged tree's generated
artifacts are already current. The branch is therefore left behind rather than
updated (see `assumptions:`).

## The limitation this run cannot close

**No real Analytics Engine query has ever been run — not by Implement, not by
Verify, not by this stage.** Every request-shape and response-rendering claim in
the run's artifacts is against a stub `fetch`. Re-measured here:

```
$ node scripts/edge-usage.mjs; echo "exit=$?"
Missing required environment variable: CLOUDFLARE_API_TOKEN
exit=1
```

This does not change on merge, and it does not change on apply. Concretely:

1. **No row can exist in `edge_requests` today**, because the binding is not
   live, because `pulumi-up.yml` cannot complete (#5169).
2. **No row can exist the moment this merges either** — merging queues an apply
   that is still blocked behind the same refresh failure.
3. **Even after a successful apply, nobody in this repo can read the dataset**
   until a token carrying _Account · Account Analytics · Read_ is created by
   hand. Nothing in the repo or in GitHub Actions holds one.

So the read path this run ships (`scripts/edge-usage.mjs`, 246 lines, 23 tests)
is itself a never-executed consumer — the same defect shape this run exists to
end, in miniature. It is declared, not hidden, in four artifacts and again here.
Release step 7 is its first real execution, and **if that execution fails, this
run re-opens**; the SQL's correctness is a claim, not a verified fact.

## The release, step by step — WRITTEN, NOT RUN

None of the following was executed by this stage. Steps 0 and 6 are human work
this run cannot do at all.

**Step 0 — GATE: someone resolves #5169.** Not this run's work and not its call.
Until `Pulumi Refresh` succeeds on `main`, every step below that depends on an
apply is a no-op. Confirm the gate is open with:

```bash
gh run list --workflow pulumi-up.yml --branch main --limit 3 \
  --json conclusion,createdAt,databaseId,headSha
# a `success` on a recent main SHA = gate open
gh run view <id> --json jobs --jq '.jobs[] | "\(.name): \(.conclusion)"'
# "Deploy Infrastructure: success" — read the JOB, not the workflow rollup
```

**Step 1 — review the PR and confirm `CI Gate` is green.**

```bash
gh pr checks <N>
gh pr view <N> --json mergeStateStatus,statusCheckRollup
```

`CI Gate` is the only required check on `main`; `codecov/patch` and
`Hospitality E2E` are advisory. A PR with no `CI Gate` at all is a known repo
state (`gate-missing`), not a green one.

**Step 2 — clear the T4 gate, then merge.** `tier-classifier.yml` labelled
#5315 **`tier:critical`** — its rule
`{ tier: T4, when: (f) => /^infrastructure\/pulumi\//.test(f), why: 'pulumi infra change' }`
fires on this diff. Per [`docs/change-tiers.md`](../../change-tiers.md) that is
the strictest tier: reviewer agent **plus** a specialist subagent, **plus** one
human review, **plus** Matt personally, **plus** an ADR or a `meta-improvement`
issue documenting why. It **blocks auto-merge by design**, which is the correct
outcome for this change and not an obstacle to route around.

This run's brief forbids tracker interaction, so **no such issue was filed by
this stage** — filing it (or writing the ADR) is part of step 2. The repo allows
squash only:

```bash
gh pr merge <N> --squash --delete-branch
```

**Step 3 — watch what the merge triggers.** The diff touches
`apps/rialto-web/**` (→ `Deploy Static Sites`), and `infrastructure/pulumi/**`
plus `infrastructure/worker/**` (→ `Pulumi Deploy`, both on the push path filter
and again via the `workflow_run` on a successful static deploy).

```bash
gh run list --branch main --limit 10 \
  --json workflowName,conclusion,databaseId,headSha
```

**Step 4 — confirm the apply actually ran.** A workflow-level `success` is not
enough: a skipped `Deploy Infrastructure` job reports success at the workflow
level. Read the job and the step.

```bash
gh run view <id> --json jobs --jq '.jobs[] | "\(.name): \(.conclusion)"'
gh run view <id> --json jobs \
  --jq '.jobs[].steps[] | "\(.name): \(.conclusion)"' | grep -i "pulumi up"
```

**Step 5 — confirm the binding is live on the deployed script.** Cloudflare
dashboard → Workers & Pages → `mattbutlerengineering-edge-router` → Settings →
Bindings: an **Analytics Engine** binding named `ANALYTICS` on dataset
`edge_requests`. (An equivalent read exists on the Cloudflare API; this run did
not exercise it and therefore does not print a command it has not run.) The
repo-side half is independently checkable at any time:

```bash
node scripts/check-analytics-bindings.mjs   # exit 0 = the three sources agree
```

**Step 6 — HUMAN: provision a read token.** Cloudflare dashboard → My Profile →
API Tokens → Create Token → Custom token → Permissions: _Account_ · _Account
Analytics_ · _Read_ → Account Resources: the one account → Create Token. Keep it
in the shell session only; do not widen `MBE_CLOUDFLARE_API_TOKEN` and do not add
it to a tracked `.env`. Full instructions:
[`docs/runbooks/edge-usage.md`](../../runbooks/edge-usage.md) § Token
provisioning.

**Step 7 — the first real read, ever.**

```bash
CLOUDFLARE_API_TOKEN=<the token from step 6> \
CLOUDFLARE_ACCOUNT_ID=<32-char account id> \
node scripts/edge-usage.mjs --days 7
```

Expected within minutes of the apply, not instantly (Analytics Engine is
eventually consistent). `0 rows — see docs/runbooks/edge-usage.md` is exit 0 and
is the **correct** answer before the apply lands — the runbook's "What zero rows
means in the first hours after deploy" section exists precisely so a reader does
not misdiagnose it. A 401/403 here means the token lacks the scope. **Anything
other than a clean table or a clean zero re-opens this run** — that is Minor 2's
named route, not a footnote.

**Step 8 — confirm the UI half.** After `Deploy Static Sites` completes, open
<https://mattbutlerengineering.com/rialto/>, open the cookie banner's preference
dialog, and confirm it shows **three** toggles (Essential, Functional,
Marketing) and no Analytics.

## Rollback plan

CI-first, per the standing deploy-via-CI-only policy.

**Before any apply has happened (the state as of writing): a revert is a
no-op on production.** Nothing is live, so rolling back means closing the PR, or
reverting the merge to keep `main` clean:

```bash
gh pr close <N>                       # if not yet merged
# or, after merge:
git fetch origin && git checkout -b revert/rialto-web-usage-instrumentation origin/main
git revert --no-edit <squash-sha>     # the single squash commit
git push -u origin revert/rialto-web-usage-instrumentation
gh pr create --base main --title "revert: rialto-web usage instrumentation" --body "…"
gh pr merge <M> --squash --delete-branch
```

**After the binding is live**, the same revert removes it on the next successful
`pulumi-up.yml` run — which, note, requires #5169 to still be resolved.

**Emergency only** (immediate, creates drift Pulumi will re-add at the next
apply, and `node scripts/check-analytics-bindings.mjs` will NOT catch it because
the guard reads source, not the live script): Cloudflare dashboard → Workers &
Pages → `mattbutlerengineering-edge-router` → Settings → Bindings → delete
`ANALYTICS`.

**What a rollback does not undo.** Rows already written cannot be un-written;
they age out at the dataset's three-month retention. This run offers no dataset
deletion step and did not create the dataset.

**Blast radius, stated plainly.** The worker change runs in the hot path of
every request to every route on `mattbutlerengineering.com`. That is why
`review.md` Major 1 exists and why the fix-up pass landed containment before
Ship: `writeAnalytics` now wraps its single `analytics.writeDataPoint(...)` call
in `try`/`catch`, with the test `still serves the response when writeDataPoint
throws` proving the handler returns 200 when the binding throws. Before that
commit, a throwing `writeDataPoint` rejected the handler _after_ the upstream
response had already been fetched, which is Cloudflare's 1101 error page for the
visitor. The rialto-web half (cookie-banner toggle removal) is client-side and
reverts with the same commit plus a `Deploy Static Sites` run.

## Release log

1. `pnpm install --frozen-lockfile` → `Done in 3.8s`.
2. Gates re-run at `bdf95bcc7` → all green, table above; one pre-existing,
   non-gating FAIL recorded in Pre-flight.
3. Trial merge with `origin/main` + `pnpm regen --check` on the merged tree →
   clean merge, artifacts current; merge aborted, tree byte-identical.
4. Two seeds appended to `docs/backlog.md` (`review.md` Minor 3 and Minor 5).
5. `pnpm exec prettier --check docs/fixes/rialto-web-usage-instrumentation/ docs/backlog.md`
   → `All matched files use Prettier code style!`, exit 0. (It failed once first,
   on a prettier idempotency quirk where a wrapped inline-code span inside a
   checklist item re-indented on every pass; the sentence was reworded so the
   span no longer wraps, rather than the check being skipped.)
6. `git commit` → `6617fb077`, then
   `git push origin fix/rialto-web-usage-instrumentation` →
   `bdf95bcc7..6617fb077`. **Verified by SHA, not by the hook:**

   ```
   local : 6617fb077e2a07b595e90a0d40c3e24388f47d45
   remote: 6617fb077e2a07b595e90a0d40c3e24388f47d45
   ```

   `.claude/hooks/verify-push-sha.sh` false-alarmed three times during this
   stage — every time naming `docs/hospitality-animations-retro`, a branch none
   of this stage's commands went near, and twice on commands that performed no
   push at all and merely _contained_ the words it matches on. That is the
   Minor 5 seed, observed live while writing it.

7. `gh pr create --base main` → **[#5315](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5315)**,
   head `6617fb077`, base `main`, `MERGEABLE`, `autoMergeRequest: null`, no
   labels. CI fired on the real `pull_request` event (runs `34723622561` CI,
   `34723622593` tier-classifier, and three others at `6617fb077`) — not the
   `GITHUB_TOKEN` anti-recursion trap, because the PR was authored by
   `mattbutlerengineering`, not by automation.
8. This artifact amended to record the PR number, and pushed again — that push
   verified the same way, `git rev-parse HEAD` against `git ls-remote`. Three
   Ship commits, not one, recorded rather than squashed out of the log; the
   commit carrying a line cannot quote its own SHA, so read the current head off
   the PR rather than off this file.
9. **No merge, no auto-merge, no deploy, no tag, no publish, no apply.**
   `gh pr merge` was never invoked in any form.

## Post-release checks

To be run by a human **after** the steps above, in this order. None has been run.

- Step 4's job-level read shows `Pulumi Up` executed → the binding is applied.
- Step 5's dashboard read shows `ANALYTICS → edge_requests` on the live script
  → the binding exists where requests actually run, not only in a plan.
- Step 7 prints a table or a clean `0 rows` → the read path works against the
  real API for the first time. **This is the run's only end-to-end evidence and
  it does not exist yet.**
- Step 8's three-toggle dialog on the live site → the consent half shipped.
- Quote the step 7 number in the next rialto-web run's retro. That was the whole
  point: `docs/features/rialto-game-ui/retro.md:33-45` ends with "no usage
  evidence", and until a number is quoted somewhere, this run has changed the
  machinery and not the outcome.

## Flagged for human review

1. **#5169 is a total IaC delivery outage, and it is nobody's assigned work.**
   Every `pulumi-up.yml` run on `main` has failed in `Pulumi Refresh` since
   2026-09-09T17:05Z. This run is the third in a row to measure it and route
   around it. Resolving it is a prerequisite for this run's value and for every
   other infrastructure change in the repo.
2. **`review.md` Minor 1 has no carrier.** The drift guard's S2 regex is global
   over `infrastructure/pulumi/index.ts` and never asks which resource the
   `analytics_engine` literal sits in, so moving the binding from the edge router
   to the `gen` worker leaves the guard green while production is unbound —
   proven in `review.md` with the guard's own exported parsers. The Pulumi unit
   test _does_ scope correctly and goes red under that mutation, so the pair is
   sound; the guard alone is not, and the guard is the half wired into
   `repo-audit`. Review routed it to a `docs/backlog.md` seed. **That seed was
   not written**, because this stage's instruction scoped the appends to Minors 3
   and 5. It needs a home.
3. **The read path has never executed against the real API** (§ The limitation
   this run cannot close). Step 6 is a manual credential step no automation in
   this repo can perform.
4. **`metrics/ai-antipattern-baselines.json` is deliberately byte-identical to
   `origin/main`'s copy rather than regenerated on this branch.** If `main` moves
   again before merge and that file changes, re-take main's copy verbatim; never
   run the antipattern script with `--update`.
5. **#5315 is `tier:critical` (T4)** and therefore cannot auto-merge: it needs a
   specialist reviewer, a human review, Matt personally, and an ADR or
   `meta-improvement` issue documenting why. **This stage filed neither** — the
   brief's tracker policy is "no issues created, edited, or referenced". The
   paperwork is release step 2, and the label is correct: a Pulumi binding on the
   Worker that fronts every route on the domain is exactly what T4 is for.

## Outcome

**PREPARED, NOT RELEASED.**
[PR #5315](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5315)
is open against `main`. Its head advanced after the PR was opened — this
artifact's own amendments, release log step 8 — so the authoritative head is
`git ls-remote origin refs/heads/fix/rialto-web-usage-instrumentation`, which
was compared against local `HEAD` and found equal after every push this stage
made. Every gate this repo runs is green on the branch and on the merge ref,
and **no merge, auto-merge, deploy, tag, publish or apply was performed by this
stage.**
The release steps above are written for a human and were not executed.

Two things a reader should carry away rather than infer: merging this PR does
not produce a single row of data while #5169 holds, and no one has yet read this
dataset — or any Analytics Engine dataset — with a real credential.

Next stage: Operate, which cannot begin until step 7 produces a number.
