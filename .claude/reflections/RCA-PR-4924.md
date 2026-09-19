# RCA: PR #4924 — Auth0 universal login branding, reverted for a live 403

**Date:** 2026-09-19
**Session:** https://claude.ai/code/session_017GfRf33xscFQxj9xJAcQ6s
**Type:** debugging / infrastructure
**Status:** Real revert, correctly root-caused already. This doc grounds the
narrative against the actual diffs and closes the one gap left open.

## Summary

PR #4924 ("fix: brand Auth0 universal login (tenant name, logo, dark
palette)", merged `3b8c3d7c`) added two new Pulumi-managed Auth0 resources —
`auth0.Tenant("mattbutlerengineering-tenant", …)` and
`auth0.Branding("mattbutlerengineering-branding", …)` — to
`infrastructure/pulumi/auth0.ts`, plus four unit tests in
`infrastructure/pulumi/index.test.ts` asserting the declared resource shape
via Pulumi's mock-runtime (`findResource(...)`). Lint, typecheck, and the new
tests all passed; the PR merged clean.

`pulumi-up.yml`'s next run against production (run `34380735703`) then failed:

```
403 Forbidden: Insufficient scope, expected any of: update:tenant_settings
403 Forbidden: Insufficient scope, expected any of: update:branding
```

The Auth0 machine-to-machine (M2M) application Pulumi authenticates with does
not carry the Management API scopes either new resource type needs. Neither
`create` mutated anything (`Insufficient scope` errors before any API call
completes), so this was a clean apply-time failure, not a partial write — but
because every subsequent `pulumi-up.yml` run on `main` would fail identically,
PR #5165 (`revert: #4924 …`, merged `6c0a54c5`) reverted the two-file diff a
half hour later to restore a green deploy path.

## Root cause

**A gap between what PR-level CI can verify and what only a live apply can
verify.** The added tests exercise Pulumi's mock provider — they assert the
_program_ declares the right `friendlyName`/`pictureUrl`/`colors`/`logoUrl`
inputs, which is the correct and only thing a unit test can check about a
Pulumi resource declaration. They cannot exercise the _live_ Auth0 M2M
credential's actual granted scopes, because that credential's grant is
runtime infrastructure state, not something in this repository. `pulumi
preview`/`pulumi up` against the real backend is exactly what the pre-push
hook and CI both correctly decline to run on every PR (it would mean applying
untrusted branch code to production infra on each push). So the one thing
that actually failed — the M2M grant lacking `update:tenant_settings` /
`update:branding` — was structurally invisible to every pre-merge gate. This
is not a missing test, a flaky test, a bad import, or a logic error in the
authored code; the Pulumi program itself is correct and mirrors the existing,
already-live `sso: true` precedent in the same file for exactly the reason
the PR's own code comments state (declaring only the fields being changed, to
avoid drifting undeclared live Tenant settings back to provider defaults).

A second-order consequence, **not part of #4924's own root cause but directly
caused by the revert**: `auth0.Tenant`/`auth0.Branding` were recorded in
Pulumi's cloud state before the 403 aborted the apply (state-record creation
and live-resource creation are different steps; the record can survive even
when the live create never completed). Revert #5165 deleted the two
resources from the _program_, but a Pulumi revert can only remove what's in
source — it cannot retroactively un-record state for resources it never
declared adding. Every `pulumi refresh` since has 403'd trying to read those
two orphaned records back (`read:tenant_settings` / `read:branding` — the M2M
grant lacks read scope too), which skipped `Pulumi Up` on every run and
silently blocked unrelated infra changes (the #4565 `/public` ingress work)
from applying for several days, until #5329 added a temporary `exclude:`
bypass.

## Is this already documented, or is something missing?

**Already documented, thoroughly.** `.claude/rules/gotchas.md` § "Pulumi / R2
state backend" carries a full bullet (added alongside #5329) naming: the
exact 403 scopes, the `pulumi-up.yml` run timestamp, both orphaned URNs
(`auth0:index/tenant:Tenant mattbutlerengineering-tenant` and
`auth0:index/branding:Branding mattbutlerengineering-branding`), the
downstream refresh-blocking mechanism, the exact bypass shape and its test
guard (`scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs`), the two
retirement conditions (scope grant vs. state deletion) with their required
orderings, and a pointer to the full recipe in
`docs/fixes/pulumi-refresh-blocks-apply/release.md`. I verified this against
the real commits (`3b8c3d7c`, `6c0a54c5`) rather than taking the gotchas.md
summary at face value — the diffs, the revert commit's stated 403 scopes, and
the run ID all match exactly. There is no drift to correct.

`docs/backlog.md` also already carries a forward-looking prevention seed
(from `maintenance:pulumi-refresh-blocks-apply`, not yet implemented):

> "a Review/`check-adr` question for any PR that adds a new provider resource
> type — 'which provider scopes/permissions does this need, and does the CI
> credential hold them?' — since the scope gap was the whole cause and no
> gate asked"

That is the right shape of fix and I am **not** duplicating it as a
competing proposal. What was missing, concretely, was a `gotchas.md` entry
that a future PR _adding a new Pulumi provider resource_ would actually
surface under — the existing bullet is framed entirely around operating the
bypass (how to retire it, in what order), not as a forward-looking warning
for the next person about to add an `auth0.*`/other new provider resource
type. I added one short, additive bullet to close that gap (see below) —
it does not touch or restructure the existing bypass bullet.

## Prevention

- **Added:** a new, separate bullet in `.claude/rules/gotchas.md` § "Pulumi /
  R2 state backend" stating the general rule this incident teaches — a green
  CI run (lint/typecheck/unit tests against Pulumi's mock provider) cannot
  prove a new provider resource type's required Management-API scopes are
  granted to the CI credential, because that credential's grant is live infra
  state, not repo state. It directs the reader to ask the scope question
  _before_ merging (cross-referencing the still-open backlog seed for a real
  gate) and cites #4924 as the case study.
- **Not re-litigated:** the existing "TEMPORARY BYPASS" bullet, the removal
  conditions, and `docs/fixes/pulumi-refresh-blocks-apply/release.md` remain
  the single source of truth for retiring the bypass — this doc and the new
  bullet both point at them rather than re-narrating them.

## Re-landing the original fix

Re-land #4924's diff (`auth0.Tenant` + `auth0.Branding` declarations, plus
its four unit tests) unchanged once **either**:

1. The Auth0 M2M grant Pulumi authenticates with is extended to carry
   `read:tenant_settings`, `update:tenant_settings`, `read:branding`,
   `update:branding` (the same four scopes needed to retire the orphan-exclude
   bypass — grant them together, not separately), or
2. The two orphaned state records are deleted from prod Pulumi state (after a
   `pulumi stack export` backup) and the M2M grant is separately confirmed to
   hold the write scopes before the re-land's `pulumi up` runs.

No code change is needed to re-land — the program is already correct. The
gate is entirely the M2M grant, which is why this RCA does not propose an
alternate implementation.
