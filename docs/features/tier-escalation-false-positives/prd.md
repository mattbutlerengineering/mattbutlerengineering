---
stage: prd
run: feature:tier-escalation-false-positives
date: 2026-10-14
ux: not-applicable
ux-reason: CI classifier workflow and a node module — no user-facing surface.
assumptions:
  - "All answers drafted from autorun-brief.md / issue #6655; no live interview. Reserved id note: issue #6655's block reserves 'prd 8' — this repo keeps feature PRDs as per-run prd.md files with no id registry, so the id is recorded here and otherwise unused."
  - "`*.md` size-counting policy taken as the issue's recommended default: exclude docs/features/** (and docs/fixes/**) run artifacts, keep other docs counting."
---

# PRD: Tier escalation counts only real review surface

## Problem statement

The tier classifier escalates PRs to human-blocking tiers on two signals that
misfire: total added lines (including generated files it already labels "T1:
auto-generated") and any prose mention of secrets/credentials/leak/rotate/
incident. Measured 2026-10-14, 3 of 4 open PRs waited on a human because of
tier; two were these false positives (#6610 size, #6541 keyword).

## Solution

Both escalation decisions become a pure, replayable module the workflow
calls. Size escalation sees only review-surface additions; keyword escalation
fires only on an actual incident signal. Behaviour change lands only after an
old-vs-new replay over the last 300 PRs, with every changed verdict pinned by
a test.

## Actors

- **Matt** — the only human reviewer; consumes tier labels as his queue.
- **Merge automation** — `merge-queue.yml` / implement-queue; treats
  `tier:standard+` as an auto-merge hold.
- **Worker agents** — author most PRs; their PR bodies routinely _describe_
  credentials/secrets without any incident.

## User stories

1. As Matt, I want size escalation to ignore generated lines, so that a PR
   like #6610 (988 code lines) does not demand my T4 review on the strength
   of `llms*.txt` churn.
2. As merge automation, I want keyword escalation to require an incident
   signal, so that descriptive prose (#6541) no longer holds green PRs.
3. As Matt, I want every tier verdict the new rules change replayed and
   pinned before the behaviour ships, so that I approve a known delta, not a
   hope.

## Success criteria

- [ ] #6610's file list classifies T3 (not T4); #6591's stays T4; #6541's
      body no longer escalates on "credentials or CI/artifact access".
- [ ] "we leaked the Stripe key and must rotate it" still escalates to T4.
- [ ] Both decisions live in `scripts/tier-escalation.mjs`, unit-tested in
      `scripts/__tests__/tier-escalation.test.mjs`, and the workflow calls
      the module instead of inline logic.
- [ ] Replay table over the last 300 PRs (old vs new, both directions) is in
      the implementation PR description; every tier change is intended or
      fixed, and each changed case is pinned by a test.
- [ ] `docs/change-tiers.md` states that generated files don't count toward
      size escalation.
- [ ] `tier-classifier-workflow.test.mjs`, `tier-classifier-dispatch.test.mjs`,
      `merge-queue-tier-race.test.mjs` stay green; `pnpm lint && pnpm
    typecheck && pnpm test` pass for affected packages.

## Out of scope

- The path-tier rule table, bypass-request rule, fork escalation, and the
  sensitive-path hard-set gate — all keep today's behaviour.
- Any change to which tiers block auto-merge (`merge-queue-eligibility.mjs`).
- Re-labelling existing open/closed PRs.

## Open questions

- Incident-cue vocabulary breadth — settled by the Architect's rule
  comparison plus the replay's changed-case review (Matt arbitrates at the
  blueprint/merge gates).
- Where the 300-PR replay runs (needs GitHub API + per-file additions) —
  Implement decides; the module must make it a one-command affair.
