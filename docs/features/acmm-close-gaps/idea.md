---
stage: idea
run: feature:acmm-close-gaps
date: 2026-11-22
---

# Idea: Close the ACMM gaps and let Claude stand in for Copilot

> acmm missing reqs: https://mattbutlerengineering.com/acmm. remove/replace copilot with another tool

## Problem

The /acmm page credits this repo for GitHub Copilot, which it does not use. It also lists 13 failing criteria. Some of those describe loop pieces that exist here under other names, such as implement-queue orchestration, the tier classifier and the dependency graph. A visitor reads the page as unmaintained, and the operator cannot tell which gaps are real.

## Who has it

- Prospective clients weighing the factory-as-a-service offer. They read /acmm as proof the factory works. Today they see a tool this repo does not run and a gap list that has not moved.
- Matt, as operator. He uses the score as a steering signal. Today he reads 13 FAILs by hand to learn which are real.

## Why now

Issue #9417 reports the score flat at 71/84 since 2026-11-20, down from 73/84 on 2026-11-19. Three criteria (`github-actions-ai`, `policy-as-code`, `component-fabric`) flipped to FAIL while the total stayed flat. The page has no per-criterion history, so the churn cannot be explained from the page alone.

## Evidence

- Issue #9417 (anecdote from one daily site audit): 71 PASS and 13 FAIL on 2026-11-22.
- `plugins/acmm/scripts/sources/acmm.js` names two Copilot criteria: `acmm:copilot-instructions` (L2, passes on `.github/copilot-instructions.md`) and `acmm:copilot-review-apply` (L4, FAIL).
- Detection rules read from the source: `copilot-review-apply` needs an active `copilot-review-apply.yml` or `ai-fix.yml` run in the last 30 days. `ai-fix-workflow` accepts `ai-fix.yml`, `fix-requested.yml` or `claude.yml`. `github-actions-ai` accepts `claude.yml` or `claude-code-review.yml`.
- `gh secret list` shows no Anthropic or Claude secret in Actions.
- In-flight check: 50+ unmerged ACMM branches exist and none carries run artifacts under `docs/features` or `docs/fixes`. No worktree matches. Nothing is already doing this work.

## Ambition rung

Chosen: Showstopper, in the user's words: "acmm missing reqs ... remove/replace copilot with another tool"
Not taken: Solid: Claude replaces Copilot in names and detection, adds the Claude workflows, closes honest gaps (not seeded, Solid is never seeded); Moonshot: every /acmm criterion shows live proof and opens its own fix issue when it regresses (seeded in docs/backlog.md)
Demo: pass — a PR suggestion becomes a Claude-pushed commit, visible on the PR and linked from /acmm
Removes a step: pass — a human no longer applies review suggestions by hand
Only this product: pass — the repo's own `reviewer-verdict` comments and `tier:*` labels feed the loop
Achievable: pass — riskiest piece is Claude Code Action auth and cost on paid Actions; a two-day spike proves it

## The demo

Before: a reviewer leaves a suggestion on a PR and a person edits and pushes the fix. After: Claude pushes the fix commit within minutes, and the /acmm row for review application links to that commit.

## Riskiest piece + spike

The riskiest piece is running Claude Code Action in this repo: the Actions secret, the cost per run, and keeping a Claude-pushed commit from merging without the review gate. Spike (about two days): add `claude.yml` on a throwaway branch, open one PR with a seeded review suggestion, and check that the action applies it correctly. Record the cost of the run.

## Cheapest kill test

Install `claude.yml` on one throwaway PR and comment `@claude apply the review suggestions`. If the commit is wrong, or the run costs more than the value of the criterion, the Showstopper dies and Solid becomes the pick.

## Solution hunch

Rename the Copilot display strings and widen `copilot-review-apply` detection to Claude workflows, keeping the criterion ids for upstream parity. Add `claude.yml`, an `ai-fix.yml` and a review-apply trigger. Retire `.github/copilot-instructions.md` once its readers are updated. For each other FAIL, alias detection to substance that exists, or leave it FAIL with a stated reason. No placeholder files.

## Success in one sentence

/acmm names no Copilot, every newly passing criterion is backed by a real mechanism, and at least one reviewer suggestion became a Claude-pushed commit on a real PR in the last 30 days, linked from the page.

## Unknowns & risks

- The Actions secret (`ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`) does not exist. Matt must set it, and the live-proof criterion cannot pass before then.
- Actions cost per Claude run on a paid plan is unmeasured.
- Widening detection may diverge from upstream ACMM scoring. Keeping the ids limits that, and #5876 set the parity rule.
- A Claude-pushed commit could reach main without the review gate. The review gate must run before any auto-merge.
- Which of the other 10 FAILs have real substance is unaudited. Some may stay FAIL.
- The committed `acmm-report.json` and the live page can disagree during churn, so a before-and-after score needs a fresh scan.

## Revision 2026-11-22

The Owner dropped the live proof and removed `acmm:copilot-review-apply` from the scorer (listed in `DROPPED_UPSTREAM_IDS`), and `claude-review-apply.yml` was deleted. The Showstopper demo and the "Success in one sentence" live-proof clause no longer apply. What shipped is the Solid scope: Copilot naming removed, `docs/governance.md` made true, and an inert `claude.yml`. The review-apply lines above are design history.
