---
stage: capture
run: maintenance:open-security-set
date: 2026-10-09
re-entry: architect
intake: "#6027"
assumptions:
  - 'Mitigation for #6027 is a public response of only { requiresDeposit: boolean }. The user did not restate that sentence; they said "fix these now" after that shape was recommended. Keep the route public; do not add a session-token gate in this run. Authenticated staff routes may keep a named score.'
  - "One maintenance run covers three tracker issues (#6027, #5369, #5995). #5962 is excluded."
  - "Release is prepare-and-stop: no merge, deploy, publish, tag, or secret rotation. A branch and a pull request are allowed so the fix can be reviewed. Do not merge it."
  - "Re-entry is architect because #5369 changes which database role the service uses and whether FORCE ROW LEVEL SECURITY is on. #6027 is a scoped response-shape fix and is the first implement work item once the breakdown exists, not blocked behind the RLS role switch."
---

# Defect: Public guest-risk disclosure, inert RLS backstop, and unpatched http-cache-semantics ignore

**Origin:** tracker intake `#6027` (the live defect that started the run). `#5369` and `#5995` are additional tracker seeds for Decompose. They are different defects, not duplicates, so there is no `intake-duplicates` list. Not a `docs/backlog.md` seed. Filed dates were not in the autorun brief; this capture did not re-read the tracker issues, so none are recorded here.

Re-entry is `architect` because `#5369` is design-touching. This file has no work-item checkboxes. `architecture.md` and `breakdown.md` own the work items. `#6027` is ordered first at Decompose and is not blocked behind the RLS role switch.

`#5962` (October secret rotation) is **excluded**. Do not execute it. Do not close it. Rotating `DIGITALOCEAN_TOKEN`, `MBE_CLOUDFLARE_API_TOKEN`, `DATABASE_URL`, and the R2 keys is a production credential change. This run must not rotate them and must not read secret values. Secret rotation stays a human runbook (`docs/SECRETS.md`).

## Defect (or Condition)

Three in-scope items. One maintenance run.

### #6027 — defect (intake)

**Observed.** `GET /public/v1/venues/:slug/guest-risk?email=...|phone=...` has no `requireAuth`. It looks up a guest by a caller-supplied email or phone and returns a named behavioral classification plus a deposit boolean. The handler sends `{ data: { riskScore, requiresDeposit } }`. Unknown guests are hard-coded `riskScore: "trusted"`, `requiresDeposit: false`. For a found guest, `riskScore` is whatever `assessGuestReliability` returns, and `requiresDeposit` is `riskScore === "risky"`.

The autorun brief described the named values as `"trusted"|"risky"`. The public contract in this worktree is wider: `GuestRiskResultSchema` is `z.enum(["trusted", "standard", "risky"])`, and the route test source expects `"standard"` when decay applies. Deposit is still only true for `"risky"`.

**Expected.** The public response no longer names a behavioral classification. The booking widget can still decide whether to show the deposit step. Logged assumption, not a new design: keep the route public; the guest-risk object is only `{ requiresDeposit: boolean }`; do not add a session-token gate in this run. Authenticated staff routes may keep a named score. `requiresDeposit` stays true for a risky guest and false otherwise (trusted, standard, and unknown guest).

The live HTTP 200 body is the service envelope `{ data: <guest-risk object> }`. `PublicVenueClient.guestRisk` unwraps that envelope. The assumption names the guest-risk object. It does not, by itself, drop the `data` envelope.

### #5369 — defect, design-touching (tracker seed, not a duplicate)

**Observed.** The reservations service and its migrate job share one `DATABASE_URL`. That role owns the tables. Table owners bypass RLS unless `FORCE ROW LEVEL SECURITY` is set. ADR-026 policy SQL does not include FORCE. The autorun brief says issue comments describe a multi-PR sequence in progress, and that FORCE must land with a non-owner role, `GRANT EXECUTE` on the resolver functions, and an app role that does not inherit the owner.

**Expected.** The app's own queries are subject to the venue RLS policies, or the architecture stage records a smaller target if it finds the role switch is not safe to finish in this run. Capture does not pick that smaller target.

### #5995 — condition (tracker seed, not a duplicate)

**Degraded.** Root `pnpm.auditConfig.ignoreGhsas` ignores `GHSA-ch52-4w7c-c8xp` because `http-cache-semantics@4.2.0` is the latest and is inside `<=4.2.0`. The autorun brief says Pulumi dev tooling pulls it in (`@pulumi/auth0` → `@pulumi/pulumi` → arborist) and that it is not a runtime request-path dependency of the APIs.

**Target state.** If npm now has a version greater than 4.2.0, add a scoped override and remove the ignore. If it does not, leave the ignore and leave `#5995` open. Do not invent a patch.

### #5962 — excluded

Not a work item. Must not be executed. Must not be closed. See the opening of this brief.

## Reproduction / Evidence

Capture read source. It did not run the test suite, so nothing below is a test result. It did not query the npm registry or the GitHub advisory API. It did not read secret values.

### #6027

Autorun brief (2026-10-09): the route "has no `requireAuth`". It "looks up a guest by caller-supplied email or phone and returns `{ riskScore: "trusted"|"risky", requiresDeposit: boolean }`". "Sibling `GuestRecognition` already dropped `lastVisit` for this class of leak (#4263 / #4268). `GuestRiskResult` did not. Public ingress for `/public/v1` has been live since #4565."

This worktree:

- `services/reservations/src/app.ts` registers the plugin under the no-auth public block: "Public routes (no auth required)" and `await fastify.register(publicGuestRiskRoutes, { prefix: "/public/v1/venues" })`.
- `services/reservations/src/routes/public-guest-risk.ts` declares `GET /:slug/guest-risk` with `rateLimit: { max: 20, timeWindow: "1 minute" }`. The schema description says "Returns guest risk score for the booking widget. Used to determine if a deposit step should be shown. Rate-limited to 20 req/min per IP." The file does not import or call `requireAuth`. The 200 schema is `{ data: { $ref: "GuestRiskResult#" } }`.
- Unknown guest: `reply.send({ data: { riskScore: "trusted", requiresDeposit: false } })`.
- Found guest: `const riskScore = assessGuestReliability(guest, venue.settings)` then `reply.send({ data: { riskScore, requiresDeposit: riskScore === "risky" } })`.
- `packages/types/src/guest.ts` `GuestRiskResult` still has `riskScore` and `requiresDeposit`. Its comment says the public endpoint "Intentionally omits `noShowCount`" and that "Only the derived `riskScore`/`requiresDeposit` fields the booking widget actually needs are returned." The sibling `GuestRecognition` comment on the same file says `lastVisit` is omitted because a precise last-visit date is unauthenticated-disclosable behavioral CRM PII.
- `packages/types/src/schemas/guest.ts` `GuestRiskResultSchema` requires `riskScore: z.enum(["trusted", "standard", "risky"])` and `requiresDeposit: z.boolean()`.
- `packages/api-client/src/public-venue.ts` `guestRisk` `getOne`s `/public/v1/venues/${slug}/guest-risk` and parses `GuestRiskResultSchema`.
- `apps/hospitality/src/components/booking-widget/useBookingFlow.ts` `fetchGuestRisk` returns only `result.requiresDeposit`.
- `services/reservations/src/routes/public-guest-risk.test.ts` source (not executed here) still expects the named score. The case "does not leak noShowCount in the public response (behavioral PII)" asserts `body.data` equals `{ riskScore: "risky", requiresDeposit: true }`. A later case expects `body.data.riskScore` to be `"standard"` and `requiresDeposit` false. The regression this run needs — public JSON has no `riskScore`, and `requiresDeposit` is still true for a risky guest and false otherwise — is not that test.

### #5369

Autorun brief, quoted as the interview, not re-verified against production roles or ADR SQL in this capture:

- "reservations service and its migrate job share one `DATABASE_URL`. That role owns the tables. Table owners bypass RLS unless `FORCE ROW LEVEL SECURITY` is set. ADR-026 policy SQL does not include FORCE."
- "Issue comments say a multi-PR sequence is in progress and FORCE must land with a non-owner role, `GRANT EXECUTE` on the resolver functions, and the app role must not inherit the owner."

Adjacent code, not proof the backstop works: `public-guest-risk.ts` comments "ADR-026 §3.3 item 3: resolve via the SECURITY DEFINER function, then run the guest lookup inside that venue's RLS context" and calls `resolveVenueId` then `runWithVenueContext`. A comment that the lookup runs inside a venue context does not show the connecting role is subject to RLS.

### #5995

Autorun brief: "GitHub advisory GHSA-ch52-4w7c-c8xp, reviewed 2026-10-02, patched versions none." The same brief's scope line says "no patched release was published as of 2026-10-09 (advisory patched versions: none)."

This worktree, not a registry lookup:

- Root `package.json` `pnpm.auditConfig.ignoreGhsas` is exactly `["GHSA-ch52-4w7c-c8xp"]`. The file has no comment stating why.
- `pnpm-lock.yaml` pins `http-cache-semantics@4.2.0`. One dependent recorded there is `make-fetch-happen@15.0.6`, which depends on `http-cache-semantics: 4.2.0`.
- Capture did **not** re-check npm or the advisory. "No patched version" is the brief's dated claim, not a registry result from this stage. The Pulumi → arborist chain is the brief's claim; this capture did not trace it past `make-fetch-happen` in the lockfile.

### Work already in flight

**Nothing matches. The check ran.**

On 2026-10-09 this capture ran `gh pr list --state open --limit 50`. It returned two open PRs, and the name-only diffs were read:

- `#6176` `feat(cli): add omp adapter and drop gemini` (`feat/cli-omp-adapter`) — agent-core and CLI adapter files, plus docs and `llms.txt` artifacts. No guest-risk, RLS, or `http-cache-semantics` paths.
- `#6177` `chore(deps): bump js-yaml from 5.4.2 to 5.4.3 in the production-deps group across 1 directory` (`dependabot/npm_and_yarn/production-deps-94f6d3737a`) — `pnpm-lock.yaml` and `tools/cli/package.json` only.

The orchestrator's check the same day reported those same two PRs and the same conclusion. This re-check agrees. The check did not fail. Nothing already awaiting review does this work, so the run proceeds. Do not fold this fix into `#6176` or `#6177`.

## Root-cause hypothesis

Hypotheses only. Not findings.

- **#6027.** The route was left unchanged when #4268 fixed only `public-guest-recognition.ts`. Consistent with the type comments in this tree: `GuestRecognition` documents the `lastVisit` omission, and `GuestRiskResult` still documents returning `riskScore` on purpose. Not established by reading the #4268 diff.
- **#5369.** Provisioning uses the owner role for both migrate and runtime, so `ENABLE ROW LEVEL SECURITY` never applies to the app. Capture did not inspect the live role or the policy SQL.
- **#5995.** The ignore exists because 4.2.0 was still the newest published version and still inside the advisory range, and the package is pulled in by dev tooling rather than an API request path. Whether a newer version exists now is unknown until the registry re-check. Do not treat the ignore as proof that no patch can exist.

## Blast radius

Review and Ship scale to this. This run's Ship is prepare-and-stop, so none of it merges or deploys from the run itself.

- **#6027.** Any internet caller who knows or guesses a guest email or phone at a venue slug learns whether that person is flagged risky. The autorun brief dates that to the public ingress fix, one venue's guests per slug. The route cap is 20 requests per 1 minute; the schema text says per IP, which stops bulk enumeration only. Bad: a behavioral classification of a real guest on an internet-reachable route. The deposit boolean is what the booking widget already branches on (`fetchGuestRisk` returns `result.requiresDeposit`). Removing `riskScore` from `GuestRiskResult` / `GuestRiskResultSchema` also touches the api-client parse and the hospitality guest-risk mock that builds `{ riskScore, requiresDeposit }` — those break if the field disappears and they are not updated with it. Staff guest records have their own `riskScore` on the guest schema; that field is not this public response. Do not strip staff scores under this item.
- **#5369.** Every venue-scoped table the policies cover. This is the dangerous item. A wrong `FORCE` or role switch either leaves the bypass in place or breaks reservations queries in production. Do not enable `FORCE` in production without the non-owner role and grants landing together. Do not admin-merge. Do not hand-edit production roles. Do not rotate secrets as part of this item.
- **#5995.** Transitive dev-tooling advisory, not an API request-path dependency, per the brief. Low. A wrong override can still fail install or Pulumi tooling. Deleting the ignore with no published patch turns `pnpm audit` red again. Leaving a real patch ignored leaves the advisory tracked but unfixed.

## Ruled out

- **#6027 — adding `requireAuth`.** The booking widget calls this before authentication. Do not re-walk that. Also out of scope: a new session-token or Auth0 design for the booking widget.
- **#6027 — treating the no-show-count omission as the fix.** The route test source already forbids `noShowCount` on the public body and still expects `riskScore`. That dead end is the previous narrowing, not this one.
- **#5369 — treating RLS as already protective.** Do not claim the backstop works while the app connects as owner. Route comments that mention an RLS context are not that claim.
- **#5369 — FORCE alone, or a hand-edited production role.** Do not enable FORCE in production without the non-owner role and grants landing together. Do not admin-merge, hand-edit production roles, or rotate secrets for this item.
- **#5995 — inventing a patch, or deleting the ignore while 4.2.0 is still the newest version inside the range.** Change code only if a patched version exists. Evidence for that fork is a registry result, not this brief's recollection.
- **#5962 — the whole issue.** Not a work item. Do not execute it. Do not close it. Do not read live secret values.
- **Open PRs #6176 and #6177.** They do not do this work. Do not extend them.

## Notes

- 2026-10-09: Capture only. No application code, no commit, no push, no issue close. Closing `#6027`, `#5369`, and `#5995` waits until Ship. Ship for this run is prepare-and-stop, so Implement must not close them. `#5962` must not be closed by this run at all.
- No new screen. The booking widget already branches on the deposit boolean. This maintenance run does not write a PRD, so there is no UX stage.
- Success the later stages are held to, from the brief: a regression test fails before the #6027 change and passes after (public guest-risk JSON has no `riskScore`, and `requiresDeposit` still reflects risky vs not); #5369 has an architecture decision recorded before any FORCE or role-switch code; #5995 is either overridden to a published patched version or explicitly left open because no patch exists.
- Next stage is architect (`re-entry: architect`).
