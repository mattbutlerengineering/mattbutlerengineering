---
stage: capture
run: maintenance:sentry-dsn-static-builds
date: 2026-08-17
re-entry: implement
origin: backlog seed (from: feature:rialto-game-ui)
---

# Defect: marketing and rialto-web ship the Sentry SDK but never initialize it

## Defect

`apps/marketing` and `apps/rialto-web` bundle `@mbe/sentry/react` and call
`initSentry(...)` on startup, exactly as `apps/hospitality` does — but in
production neither one ever calls `Sentry.init`. Every runtime error on the
main public site (`/`) and on the design-system showcase (`/rialto`) is
dropped silently.

**Observed:** the deployed bundles for marketing and rialto-web contain zero
references to the Sentry ingest host. Hospitality's contains one.

**Expected:** all three apps report to Sentry. The commit that introduced
Sentry (`c68317df7`) added it to all three deliberately.

The cause is not in app code — all three `main.tsx` files are the same shape.
It is entirely in `.github/workflows/deploy-static.yml`, which supplies the
Sentry build environment to the hospitality build step only.

## Reproduction / Evidence

**1. The workflow supplies the env to exactly one of three builds.**

`deploy-static.yml` has three build steps. Only hospitality carries an `env:`
block:

```
159:      - name: Build hospitality
160:        run: pnpm build --filter=@mbe/hospitality
161:        env:
...
167:          VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}
168:          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
169:          SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
170:          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
```

Neither sibling step carries any of them. `rialto-web` has no `env:` block at
all; `marketing` has one, but it holds only `VITE_BUILD_ID`:

```
132:      - run: pnpm build --filter=@mbe/marketing
133:        env:
134:          VITE_BUILD_ID: ${{ github.sha }}
195:      - run: pnpm build --filter=@mbe/rialto-web
```

(Corrected 2026-08-17 during Implement — an earlier draft of this brief said
both siblings had no `env:` block. Marketing's exists; it is simply missing
every Sentry variable. The distinction only changes the shape of the edit —
append versus add — not the defect.)

**2. The code path that turns that into silence.**

Vite inlines `import.meta.env.VITE_SENTRY_DSN` at build time, so an absent
variable becomes `undefined`. `packages/sentry/src/config.ts:21` derives
enablement purely from DSN length:

```ts
enabled: resolvedDsn.length > 0,
```

and `packages/sentry/src/react.ts:22-25` early-returns on it:

```ts
const config = resolveConfig(options.dsn);
if (!config.enabled) {
  return;
}
```

So `Sentry.init` is never reached. The SDK is still bundled and shipped — it
just does nothing. Nothing logs, nothing warns.

**3. Confirmed on the deployed surface, not inferred.**

Fetched each live bundle and counted occurrences of the ingest host:

| Site        | Bundle                                  | `ingest.us.sentry.io` occurrences |
| ----------- | --------------------------------------- | --------------------------------- |
| hospitality | `/hospitality/assets/index-DrccHO7c.js` | **1**                             |
| marketing   | `/assets/index-BX5NGZF2.js`             | **0**                             |
| rialto-web  | `/rialto/assets/index-q8BxDpz1.js`      | **0**                             |

A DSN that was never inlined cannot appear in the bundle, which is why the
count is the reliable signal here.

**4. Secondary effect — source maps are never uploaded either.**

All three `vite.config.ts` files register `sentryVitePlugin` with
`disable: !process.env.SENTRY_AUTH_TOKEN`. Because marketing and rialto-web
receive no `SENTRY_AUTH_TOKEN`, the plugin self-disables and no source maps
are uploaded. This means fixing only `VITE_SENTRY_DSN` would produce reports
whose stack traces are minified and unreadable — the fix has to cover all four
variables to be worth anything.

## Root-cause hypothesis

**Hypothesis (well-supported by history, still a hypothesis):** the env block
was written for hospitality when its Sentry deploy wiring was set up, and was
never propagated to the two sibling build steps in the same file.

The git history states this almost explicitly:

- `c68317df7` (2026-04-02) — _"feat(apps): integrate Sentry error tracking in
  hospitality, rialto-web, and marketing"_ — all three apps, one commit.
- `7d7d79a86` (2026-05-18) — _"ci(hospitality): pass Sentry DSN and source map
  credentials to deploy build"_ — the CI half, **hospitality only**.

Six weeks separate the app-level integration from the CI wiring, and the CI
wiring was scoped to one app by its own commit message.

This is the same shape as the preventive finding from the previous run
(`maintenance:rialto-web-fonts`, backlog seed 21): #3149 fixed a CSP defect in
`apps/marketing` while `apps/rialto-web` carried the identical bug, and the
guard written six weeks later would have gone red immediately had it existed
at the first fix. Same failure mode, different subsystem — which is why work
item 1 below writes the guard **before** the fix rather than after.

## Blast radius

- **Who:** every visitor to `https://mattbutlerengineering.com/` (marketing —
  the primary public site) and `https://mattbutlerengineering.com/rialto/`
  (the design-system showcase).
- **What:** 100% of client-side runtime errors on both sites are unreported.
  Not sampled, not delayed — never sent.
- **Since when:** 2026-04-02 (`c68317df7`), when the apps began calling
  `initSentry` without the CI ever supplying a DSN. That is roughly **4.5
  months**. The 2026-05-18 hospitality wiring narrowed the gap to two apps
  rather than three; it never closed it.
- **How badly:** no production incident is attributable to this, because by
  construction there is no evidence either way — the absence of errors in
  Sentry for these two apps reads identically to a clean run. That ambiguity
  is itself the harm.
- **Not affected:** hospitality (reports correctly), and all backend services
  (`@mbe/sentry/node`, a separate `SENTRY_DSN` path).

## Ruled out

- **CSP is not blocking it.** Production `connect-src` already includes
  `https://o4510650299842560.ingest.us.sentry.io` (verified live against the
  response header, and all three sites are served by the same edge worker).
  No CSP change is needed, and CSP is not a competing explanation — the DSN
  never reaches the bundle in the first place.
- **Not exposed source maps.** The hypothesis that a disabled
  `sentryVitePlugin` leaves `.map` files publicly served was checked and is
  false: `index-*.js.map` returns `404` on all three sites. Do not re-walk it.
- **Not an app-code defect.** `apps/marketing/src/main.tsx:19-22` and
  `apps/rialto-web/src/main.tsx:19-22` are structurally identical to
  hospitality's. Nothing in app code needs to change.
- **Not a missing secret.** `VITE_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`
  and `SENTRY_AUTH_TOKEN` all exist in the repo secret list; they are simply
  not referenced by two of the three build steps.

## Work items

- [x] **Guard test first (RED)** — add a test that reads the real
      `.github/workflows/deploy-static.yml` and asserts that every static-app
      build step passes the full Sentry env set, so a future app added without
      it fails the gate instead of silently going dark. Follow the existing
      workflow-assertion style of `scripts/__tests__/pulumi-cli-pin.test.mjs`
      (parse the actual file; no fixture copy). Enumerate the apps explicitly
      rather than globbing — a glob fails silently in the direction that hides
      a missing app.
  - Accept: the test fails before any workflow change, and its failure message
    names both `marketing` and `rialto-web`.

- [x] **Pass the Sentry env to both sibling build steps (GREEN)** — add
      `VITE_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and
      `SENTRY_AUTH_TOKEN` to the marketing and rialto-web build steps in
      `deploy-static.yml`, matching hospitality's block. Workflow change only;
      no app code.
  - Accept: the guard test from item 1 passes, and `pnpm --dir scripts test`
    is green.

- [x] **Verify on the deployed surface after release** — once CI has deployed
      both sites, re-run the bundle probe from Evidence §3.
  - Accept: the marketing and rialto-web bundles each report **≥1** occurrence
    of `ingest.us.sentry.io`, up from 0, with hospitality unchanged at ≥1.

## Notes

- 2026-08-17 — Scope widened at capture time versus the originating backlog
  seed, which named only `VITE_SENTRY_DSN`. Evidence §4 shows the three
  source-map variables share the same root cause and the same fix; shipping
  the DSN alone would yield unsymbolicated traces and read as "fixed".
- Deploys go through CI only (no manual `wrangler`), so work item 3 cannot run
  until the change has merged and `deploy-static.yml` has deployed both sites.
- `deploy-static.yml` is path-filtered per app, so the deploy that proves this
  will only run for apps whose paths changed. Confirm during Ship that both
  sites actually redeployed rather than assuming the merge was enough.
