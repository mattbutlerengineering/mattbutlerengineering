# Autorun brief — e2e-behind-edge-csp

Collected once, 2026-08-21. Source of interview answers for every stage of
this run. Not an artifact: carries no frontmatter and never counts toward
orientation.

## Run

- **Scale:** maintenance run. Artifacts live in `docs/fixes/e2e-behind-edge-csp/`.
- **Variant:** condition brief (something is degraded), not a defect brief.
  Filename stays `defect.md`.
- **Slug:** `e2e-behind-edge-csp`.
- **Re-entry depth:** not specified by the user — capture decides and logs the
  choice under `assumptions:`. Note for that decision: the plausible fixes
  differ in kind (Playwright route interception vs. a preview-server
  middleware vs. running the real worker under `wrangler dev`), which reads
  design-touching rather than scoped.
- **Origin:** backlog seed, `docs/backlog.md` — "Run at least one E2E pass
  behind the real edge CSP". Claim it in place per the protocol's seed-backlog
  section by appending `(claimed: maintenance:e2e-behind-edge-csp)`.

## What is degraded

`apps/rialto-web/playwright.config.ts` serves the entire E2E suite from
`vite dev` with no `Content-Security-Policy` header. Production serves the
same app through `infrastructure/worker` with a strict nonce-based CSP. So
every CSP-caused defect is invisible to visual and functional E2E **by
construction, not by oversight** — the harness never applies the policy that
production enforces.

## Evidence of degradation

- `apps/rialto-web/playwright.config.ts`: `webServer.command` is
  `pnpm --filter @mbe/rialto-web dev -- --port 5173 --strictPort`;
  `use.baseURL` is `http://localhost:5173/rialto/`. No CSP anywhere in the
  config, and `vite dev` sets none.
- Production CSP, measured live on 2026-08-21 against
  `https://mattbutlerengineering.com/rialto/`:
  `default-src 'self'; script-src 'nonce-<per-request>' 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' <auth0> https://api.mattbutlerengineering.com <sentry-ingest>; frame-src …; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.
- Two independent prior runs named this gap in their retros:
  - `docs/fixes/rialto-web-fonts/` — an inline `onload="this.rel='stylesheet'"`
    violated `script-src`, so the Google Fonts stylesheet was never promoted
    and the design system's own showcase rendered in `system-ui` for nine
    weeks. Every gate stayed green throughout.
  - `docs/features/rialto-game-ui/` — the Sentry ingest origin was missing
    from `connect-src` until PR #4315, so every browser error envelope from
    every app was refused with no server-side signal.
- The same class recurred across apps: #3149 fixed the inline-`onload`-under-
  nonce-CSP defect in `apps/marketing` on 2026-07-04 while `apps/rialto-web`
  had carried the identical bug since 2026-06-14.

## Target state that ends the run

At least one E2E pass over `apps/rialto-web` executes against a served
document carrying the **real** production CSP — same directive set the edge
emits, same per-request nonce injection — such that a CSP refusal fails the
run. A regression of the rialto-web-fonts defect (an inline `on*=` handler,
or an un-nonced inline script) must turn that pass red.

Verify is never skippable in a maintenance run: the reproduction above is the
regression test.

## Useful starting points (not a design decision — architect/implement owns that)

- `infrastructure/worker/csp.js` exports two pure, already-unit-tested
  functions: `buildCspDirectives(nonce, options)` and
  `injectNonceIntoHtml(html, nonce)`. Reusing them is what makes "the real
  CSP" real rather than a second hand-maintained copy that can drift.
- `infrastructure/worker` is a full pnpm workspace package (`@mbe/edge-worker`)
  since #3911, with its own vitest config — importing from it is supported.
- `apps/rialto-web/e2e/workflow-coverage.test.ts` already fails if an
  `e2e/*.spec.ts` file is not referenced by full path in
  `.github/workflows/rialto-web-e2e.yml`. Any new spec must be wired there or
  that gate goes red — and per #3955, use an explicit file list, never a glob.

## Scope

**In:** the rialto-web E2E harness and whatever it takes to run it under the
production CSP; the regression assertion; CI wiring.

**Out:** changing the production CSP itself; the other static apps
(`marketing`, `hospitality`) unless the chosen mechanism is trivially shared —
if it is, say so rather than silently widening; a CSP `report-to`/`report-uri`
endpoint (separate backlog seed, separate run).

## Folded-in record correction

This run also corrects two stale claims proven false during brief collection
on 2026-08-21. Ride the run's existing PR; do not open a separate one.

1. `docs/backlog.md` — the seed "Fix or remove the failing Cloudflare Insights
   beacon — `static.cloudflareinsights.com/beacon.min.js` returns
   `ERR_CONNECTION_REFUSED` on every page load" is wrong and should be removed
   or rewritten as resolved-not-a-defect, so it stops being re-picked.
2. `docs/features/rialto-game-ui/retro.md` — "There is also no analytics, no
   beacon … The Cloudflare Insights beacon that _is_ injected fails to load"
   is wrong on the beacon specifically.

**What was actually measured:**

- The beacon is absent from repo source and from the origin HTML; Cloudflare
  Web Analytics injects it at the edge at runtime.
- The injected tag is correctly nonced — attributes
  `type,src,integrity,nonce,data-cf-beacon,crossorigin`. CSP does **not**
  block it. Only a hand-injected un-nonced copy drew
  `script-src-elem blocked https://static.cloudflareinsights.com`.
- `dig +short static.cloudflareinsights.com` returns `0.0.0.0` through the
  LAN resolver `192.168.4.40`, but `104.16.80.73` / `104.16.79.73` through
  `@1.1.1.1`.
- `curl --resolve static.cloudflareinsights.com:443:104.16.80.73` returns
  **HTTP 200** with 28 KB (bare URL) and 31 KB (versioned URL) of real
  JavaScript.

So the failure was a LAN-level DNS sinkhole on the machine every probe runs
from — not a production fault. Correct the two files to say that; do not
"fix" the beacon.

Keep the correction factual and short. The broader claim in that retro — that
rialto-web has no first-party usage instrumentation — still stands and is a
separate open seed; only the beacon sentence is wrong. Whether events actually
land in the Cloudflare Web Analytics dashboard was **not** verified (needs
dashboard access) — do not assert that they do.

## Constraints

- Node 22 (`.nvmrc`). Run `nvm use`.
- Deploys go through GitHub Actions only — never manual `wrangler` or `doctl`.
- Worktree agents: `pnpm install --frozen-lockfile` first, and run
  `pnpm typecheck` before declaring done. `.husky/pre-push` runs neither.
- The PostToolUse prettier hook leaves ~171 files permanently dirty. Never
  `git add -A`; stage explicit paths only.
- Files written via Bash heredoc skip all formatting hooks — run prettier with
  an explicitly resolved `--config` on them, or CI's Build job fails repo-wide.

## Tracker policy

Mirror **out** only (ADR-0026). Work items are published as GitHub issues with
the mapping recorded alongside them, and each closes as its item completes.
Nothing in the tracker seeds this run.

Note the interaction with re-entry depth: mirror-out is specified "at
decompose", but with `re-entry: implement` there is no `breakdown.md` and no
decompose stage. In that case publish at the point work items are drafted —
inline in `defect.md` — using the protocol's reference form,
`- [ ] **<Item>** — <one line> (tracker: #123)`.

## Release authorization

**Authorized through merge.** Open the PR, run the gates, merge on green
(squash, delete branch). Deployment follows through GitHub Actions; take no
manual deploy action.

Hard stops that override this authorization:

- Unfixed critical review findings block the merge. Stop and surface instead.
- `CI Gate` is the only required check on `main`. Gate on it plus the
  build/test/lint/typecheck/Integrity/Architecture-Audit jobs — not on an
  all-green rollup. `codecov/patch` and `Hospitality E2E` are advisory.
- Green-main policy: if `main` breaks, fixing it outranks this run.

## Known unknowns / ways this dies

- The three candidate mechanisms differ a lot in cost and fidelity. Route
  interception is cheapest but simulates the edge rather than running it;
  `wrangler dev` is highest fidelity but heaviest in CI. This is the run's
  central design call.
- Turning the real CSP on may surface _existing_ violations beyond the one
  being guarded against. That is a success, not a failure — but it can widen
  the run. Surface it rather than silently fixing everything found.
- Visual baselines are Linux-CI-specific. If the change affects rendering at
  all, regenerate from the CI artifact, never from macOS.
