# Autorun brief — open security set

Date: 2026-10-09
Run: maintenance:open-security-set
Directory: docs/fixes/open-security-set
Driven by autorun. This file is the only interview. It is not a stage artifact.

## What and why

Fix the open GitHub issues labeled `security` on mattbutlerengineering/mattbutlerengineering, in the priority order already applied:

1. #6027 `priority:high` — public guest-risk endpoint still returns a named `riskScore` for any caller-supplied email or phone.
2. #5369 `priority:medium` — Postgres RLS venue backstop is a no-op because the app DB role owns the tables.
3. #5995 `priority:low` — GHSA-ch52-4w7c-c8xp in transitive `http-cache-semantics`; no patched release was published as of 2026-10-09 (advisory patched versions: none).
4. #5962 `priority:medium` — October secret rotation. **Out of this run's execution.** Rotating `DIGITALOCEAN_TOKEN`, `MBE_CLOUDFLARE_API_TOKEN`, `DATABASE_URL`, and the R2 keys is a production credential change. Autorun must not rotate them, must not read secret values, and must not close #5962.

Why now: #6027 discloses a behavioral classification about a real guest on an internet-reachable route. The other two in-scope items are a control that reads as protection and does nothing, and a tracking ignore that must not be deleted until a real patch exists.

## Scale

Maintenance run. Slug: `open-security-set`.

Re-entry is `architect`. #5369 changes which database role the service uses and whether `FORCE ROW LEVEL SECURITY` is on. That is design-touching. #6027 is a scoped response-shape fix and must be the first implement work item once the breakdown exists, not blocked behind the RLS role switch landing.

## Interview answers (capture)

Working title: Public guest-risk disclosure, inert RLS backstop, and unpatched http-cache-semantics ignore.

### #6027 — defect

- Observed: `GET /public/v1/venues/:slug/guest-risk?email=...|phone=...` has no `requireAuth`. It looks up a guest by caller-supplied email or phone and returns `{ riskScore: "trusted"|"risky", requiresDeposit: boolean }`. File: `services/reservations/src/routes/public-guest-risk.ts`.
- Expected: the public response no longer names a behavioral classification. The booking widget can still decide whether to show the deposit step.
- Reproduction: read the route. `assessGuestReliability` result is returned as `riskScore`. Sibling `GuestRecognition` already dropped `lastVisit` for this class of leak (#4263 / #4268). `GuestRiskResult` did not. Public ingress for `/public/v1` has been live since #4565.
- Hypothesis: the route was left unchanged when #4268 fixed only `public-guest-recognition.ts`.
- Blast radius: any internet caller who knows or guesses a guest email or phone at a venue slug learns whether that person is flagged risky. Since the public ingress fix. One venue's guests per slug. Rate limit 20/min/IP stops bulk enumeration only.
- Ruled out: adding `requireAuth`. The booking widget calls this before authentication. Do not re-walk that.
- Decided mitigation (user said "fix these now" after this shape was recommended; treat as the assumption to log, not a new design): keep the route public; response body is only `{ requiresDeposit: boolean }`; do not add a session-token gate in this run. Authenticated staff routes may keep a named score. Regression test must show the public JSON has no `riskScore` and that `requiresDeposit` is still true for a risky guest and false otherwise.

### #5369 — defect, design-touching

- Observed: reservations service and its migrate job share one `DATABASE_URL`. That role owns the tables. Table owners bypass RLS unless `FORCE ROW LEVEL SECURITY` is set. ADR-026 policy SQL does not include FORCE. Issue comments say a multi-PR sequence is in progress and FORCE must land with a non-owner role, `GRANT EXECUTE` on the resolver functions, and the app role must not inherit the owner.
- Expected: the app's own queries are subject to the venue RLS policies, or the brief records a smaller target if the architecture stage finds the role switch is not safe to finish in this run.
- Hypothesis: provisioning uses the owner role for both migrate and runtime, so ENABLE ROW LEVEL SECURITY never applies to the app.
- Blast radius: every venue-scoped table the policies cover. A wrong FORCE or role switch either leaves the bypass in place or breaks reservations queries in production. This is the dangerous item. Do not enable FORCE in production without the non-owner role and grants landing together.
- Ruled out: treating RLS as already protective. Do not claim the backstop works while the app connects as owner.
- Constraint: do not admin-merge, do not hand-edit production roles, do not rotate secrets as part of this item.

### #5995 — condition

- Degraded: root `pnpm.auditConfig.ignoreGhsas` ignores GHSA-ch52-4w7c-c8xp because `http-cache-semantics@4.2.0` is the latest and is inside `<=4.2.0`. Pulumi dev tooling pulls it in (`@pulumi/auth0` → `@pulumi/pulumi` → arborist). It is not a runtime request-path dependency of the APIs.
- Evidence: GitHub advisory GHSA-ch52-4w7c-c8xp, reviewed 2026-10-02, patched versions none.
- Target state: if npm now has a version greater than 4.2.0, add a scoped override and remove the ignore. If it does not, leave the ignore and leave #5962's neighbor issue #5995 open. Do not invent a patch.

### #5962 — excluded

Secret rotation stays a human runbook (`docs/SECRETS.md`). Not a work item. Do not close the issue.

## Tracker

Yes. The user pointed at the open `security` label query and said to fix them. Seed work items from #6027, #5369, and #5995. They are not duplicates; do not put them in `intake-duplicates`. Record #6027 as `intake:` because it is the live defect that started the run. Name #5369 and #5995 in the brief body as additional tracker seeds for Decompose.

Closing those issues waits until Ship, and Ship is prepare-and-stop (below), so do not close them during Implement.

## Scope

In:

- Public guest-risk response stops disclosing `riskScore`, with a regression test, booking-widget deposit decision preserved.
- An architecture and breakdown for the RLS owner bypass that a later implement step can execute only as far as the breakdown's checked items, without a production role change done by hand.
- A registry re-check of `http-cache-semantics`. Change code only if a patched version exists.

Out:

- #5962 secret rotation, and any read of live secret values.
- Manual `npm publish`, `doctl` deploy, `wrangler deploy`, tag, or merge to main.
- New session-token or Auth0 design for the booking widget.
- Refactors outside the files the failing check or the breakdown names.
- Editing priority labels, branch protection, or auto-merge rules.
- The unrelated open PRs #6176 (omp adapter) and #6177 (js-yaml).

## Success

- A regression test fails before the #6027 change and passes after: public guest-risk JSON has no `riskScore`, and `requiresDeposit` still reflects the risky/trusted assessment.
- #5369 has an architecture decision recorded before any FORCE or role-switch code.
- #5995 is either actually overridden to a published patched version, or explicitly left open because no patch exists. Evidence is the registry result, not a recollection.

## User-facing surface

No new screen. The booking widget already branches on the deposit boolean. `ux` would be not-applicable; this maintenance run does not write a PRD.

## Release authorization

Prepare and stop. No deploy, publish, tag, or merge. A branch and a pull request are allowed so the fix can be reviewed. Do not merge it.

## Already in flight

Checked 2026-10-09: open PRs were #6176 `feat(cli): add omp adapter and drop gemini` and #6177 `chore(deps): bump js-yaml`. Neither changes guest-risk, RLS, or http-cache-semantics. Nothing already does this work.

## Assumptions already made by the orchestrator

- Mitigation for #6027 is `{ requiresDeposit: boolean }` only. The user did not restate that sentence; they said "fix these now" after that recommendation.
- One maintenance run covers three tracker issues. #5962 is excluded.
- Re-entry is architect because of #5369, with #6027 ordered first at Decompose.
- Release is prepare-and-stop.
