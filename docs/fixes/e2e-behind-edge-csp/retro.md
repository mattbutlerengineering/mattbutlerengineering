---
stage: operate
run: maintenance:e2e-behind-edge-csp
date: 2026-08-22
assumptions:
  - "Written within an hour of the merge. The rendering and CI outcomes below are measured against a real run, so the usual 'too early to retro' caveat does not apply to them. It does apply to the durability question — whether this guard is still trusted and still green in a month is unknowable today and is deliberately not claimed."
---

# Retro: E2E behind the real production CSP

## Outcome vs. intent

`defect.md` set one target state: at least one E2E pass over `apps/rialto-web`
executes against a served document carrying the real production CSP — same
directive set, same per-request nonce injection — **such that a CSP refusal
fails the run**. Concretely, reintroducing the `rialto-web-fonts` defect had to
turn that pass red.

**Met, and met in the strong form.** Eight tests across five routes run against
built output under the real policy (`8 passed (9.4s)`, CI run 32616179962 step
10). The policy is imported from `@mbe/edge-worker/csp.js` rather than copied,
so the harness cannot drift from what the edge actually emits — the failure mode
that would have made the whole guard theatre.

And the red half was demonstrated, not assumed: the suite was deliberately
broken four ways during Verify, including under the exact pre-fix condition of
**no CSP header at all**, and went red every time.

- **Signal strength: measured**, on both the pass and the fail side.

## Run retrospective

**Keep — proving the guard fails.** This is the single most valuable thing the
run did, and it is cheap. A test that has only ever been seen passing is
indistinguishable from a test that cannot fail; this repo has shipped that exact
shape before, and the _shipped ≠ run_ rule exists because of it. Four deliberate
breakages took minutes and converted "we added a CSP test" into "we added a
guard that has been observed doing its job."

**Keep — importing the policy instead of copying it.** A copied directive list
would have passed every test in this run and been wrong the first time someone
edited the edge. The import makes divergence impossible rather than unlikely.

**Keep — reviewing inline rather than dispatching.** Three stage subagents died
mid-run earlier in this session, and a stalled reviewer _fails open_: it returns
nothing, which reads exactly like a clean pass. Reviewing inline found F1, which
was a real hole.

**Change — a new guard's trigger conditions deserve as much scrutiny as its
assertions.** F1 was the whole run in miniature: the CSP suite was correct,
comprehensive, and wired into CI — and would not have run when
`infrastructure/worker/**` changed, i.e. precisely when the CSP itself changed.
The assertions got careful attention; the `paths:` filter almost shipped
unexamined. A guard that does not fire on the change it guards against is worth
close to nothing, and the omission is invisible in a green CI run.

**Change — do not narrate a fact you have not just measured.** This run's
`release.md` first drafted "six pending changesets, including the TapeChart
change." Checking before committing showed none of the six is TapeChart —
`e4c30808` added no changeset at all. Second occurrence of this exact failure in
one session (the first put a closed issue in `tape-chart-overlaps/release.md` as
open). Both were caught, both should not have been written.

**Stop — treating "the artifact is on `main`" as the end of a ship.** Ship
prepared and merged; the thing that actually retired the risk was reading step 10
of a real CI run and seeing `8 passed`. `release.md` was deliberately written
after that, in one pass, instead of shipping an empty `## Outcome` to fill in
later — which is what the previous run did, and what created the stale-issue
error above.

## Known gaps, carried not closed

- **A flake earlier in the `functional` job silently removes CSP coverage.**
  Deliberate cost tradeoff (~2–3 billed minutes to split the job). Now written
  down, which was the missing part.
- **The guard is advisory.** `Rialto Web E2E` is not a required check, so a red
  CSP suite fails the run without blocking the merge. Branch-protection state,
  not repo code — the repo owner's call.
- **F1's filter is wired, not yet exercised.** No commit has touched
  `infrastructure/worker/**` since it landed.

## Idea seeds

- Audit every CI guard's `paths:` filter against the directory it guards — F1 was a CSP test that would not have run when the CSP changed, and that omission is invisible in a green run (from: maintenance:e2e-behind-edge-csp)
- Make "prove the guard fails" a required step for any new test that exists to catch a specific defect class — it took minutes here and is the only thing separating a guard from a decoration (from: maintenance:e2e-behind-edge-csp)
- Split the CSP suite into its own CI job, or emit an explicit skipped-coverage signal, so a flake in an earlier step cannot silently remove CSP coverage while the result still reads as a normal red (from: maintenance:e2e-behind-edge-csp)

## Run complete

Closed 2026-08-22. Target state met and verified against a real CI run; three
gaps carried forward explicitly rather than closed quietly.

Shipped: PR #4476 (`c2686caa`). Guard verified running in CI run 32616179962.
