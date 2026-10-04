---
stage: capture
run: maintenance:browser-sentry-env-release
date: 2026-10-04
re-entry: implement
origin: "docs/backlog.md seed: Make browser Sentry events report the real environment and release (from: feature:sentry-silence-alert), claimed in place"
assumptions:
  - "Mechanism chosen by Capture, which the brief delegated ('Capture/Implement decide the mechanism from code and docs'): the app passes `import.meta.env.MODE` into `initSentry`, and react.ts leaves `release` off `Sentry.init` when it has no value. `config.ts` and `node.ts` stay untouched. The rejected alternative is under Notes."
  - "Environment value is Vite's `import.meta.env.MODE`. Every static build runs plain `vite build` (mode `production`), and `deploy-static.yml` is the only workflow that sets a DSN. So production builds report `production` and a local `vite dev` with a DSN reports `development`. No preview or staging build sends events today, so no third environment name is needed."
  - "apps/gen is included as a one-line sibling sweep (it calls the same `initSentry`) even though `deploy-static.yml` does not deploy it. This follows the backlog's 'sweep sibling apps at the first fix' seed. Dropping it is safe if Review objects."
  - "@mbe/sentry needs no changeset: its package.json is `private: true`, and the only changeset gate in CI is `check-rialto-changeset.mjs`, which covers `packages/rialto/src/**` only."
  - "Backend `release: null` (measured below) is out of scope. The brief limits scope to the browser and requires backend behaviour to stay unchanged. It is recorded under Notes as a candidate seed and not fixed here."
---

# Defect: production browser Sentry events report `environment: development` and `release: null`

## Defect

**Observed (measured 2026-10-04):** every production browser event from the static apps reaches Sentry with `environment: development` and `release: null`. So production browser errors can't be filtered apart from dev ones, and none can be tied to the deploy whose source maps `sentryVitePlugin` uploaded.

**Expected:** production browser events carry `environment: production`. They also carry `release: <deployed git SHA>`, the same release name `sentryVitePlugin` uploads source maps under (see `docs/fixes/static-sourcemaps-confirm/release.md`).

**Constraint:** backend Sentry (`@mbe/sentry/node`, through `@mbe/service-bootstrap`) must keep its current behaviour byte for byte.

## Reproduction / Evidence

All of the following were measured read-only on 2026-10-04 unless marked otherwise.

1. **Sentry (MCP, org `mattbutlerengineering`, errors dataset, last 14 days), grouped by project, platform, environment and release:**

   | project               | platform   | environment     | release  | count | last seen         |
   | --------------------- | ---------- | --------------- | -------- | ----- | ----------------- |
   | hospitality           | javascript | **development** | **null** | 54    | 2026-10-03T17:42Z |
   | mattbutlerengineering | javascript | **development** | **null** | 4     | 2026-10-03T17:28Z |
   | users-api             | node       | production      | null     | 96    | 2026-10-03T17:28Z |
   | agent-api             | node       | production      | null     | 26    | 2026-10-03T17:28Z |
   | reservations-api      | node       | production      | null     | 23    | 2026-10-03T17:42Z |

   The browser rows show the defect. The node rows are the backend baseline that must not change: `production` / `null`.

2. **Live bundles** (entry chunks fetched from `/`, `/rialto/` and `/hospitality/`). This is the compiled `resolveConfig`, identical in all three apps (hospitality's copy is in `sentry-vendor-*.js`):

   ```js
   environment:(typeof process<`u`?{}.SENTRY_ENVIRONMENT:void 0)??(typeof process<`u`?`production`:void 0)??`development`,
   release:(typeof process<`u`?{}.SENTRY_RELEASE:void 0)??(typeof process<`u`?{}.npm_package_version:void 0)
   ...
   Uf({dsn:t.dsn,environment:t.environment,release:t.release,...})
   ```

   - Vite **did** inline `process.env.NODE_ENV` as `"production"`, but the surviving `typeof process !== "undefined"` guard is false in a browser. So the expression falls through to `"development"`.
   - `release` evaluates to `undefined` and is passed explicitly.

   The same chunks also carry the plugin-injected global:
   - marketing and rialto-web: `e.SENTRY_RELEASE={id:"4402db7610dff383535d4026609fd1cd06414b77"}`
   - hospitality: `e.SENTRY_RELEASE={id:"728517fe523518f2e8493f4ec5383a2320cbea75"}`, the #6032 merge SHA.

   In other words, the right release is already present in every bundle, and only our explicit `undefined` hides it.

3. **SDK behaviour.** Locked version `@sentry/react` / `@sentry/browser` / `@sentry/core` **11.4.0** (`pnpm-lock.yaml`). The source below was read from the installed copy in the `static-sourcemaps-confirm` worktree's `node_modules/.pnpm`, because this worktree has no `node_modules` yet:
   - `@sentry/browser/build/npm/esm/prod/client.js:12-13`: the `BrowserClient` constructor calls `applyDefaultOptions(options)`.
   - `@sentry/browser/build/npm/esm/prod/client.js:67-75`:
     `return { release: typeof __SENTRY_RELEASE__ === "string" ? __SENTRY_RELEASE__ : WINDOW.SENTRY_RELEASE?.id, sendClientReports: true, parentSpanIsAlwaysRootSpan: true, ...optionsArg };`
     Because `...optionsArg` is spread **last**, an own `release: undefined` key overwrites the `WINDOW.SENTRY_RELEASE.id` default. An **absent** key keeps the default. This is the mechanism behind `release: null`.
   - `@sentry/react/build/esm/sdk.js:6-12` and `@sentry/browser/.../sdk.js:31-46`: both spread the options through unchanged, so nothing in between strips the `undefined`.
   - `@sentry/core/build/esm/utils/prepareEvent.js:75`: `event.environment = event.environment || environment || DEFAULT_ENVIRONMENT`. `DEFAULT_ENVIRONMENT` is `"production"` (`constants.js:1`). The SDK would default to `production` on its own, but we pass `"development"` explicitly.

4. **Existing tests encode the browser path through `process.env`.** `packages/sentry/src/react.test.ts:65-110` sets `process.env.NODE_ENV` / `SENTRY_*` and asserts the result reaches `Sentry.init`. That only works because vitest runs in Node. None of these tests models a browser, where `process` is undefined, so the defect has no failing test today.

## Root-cause hypothesis

This started as the brief's hypothesis. Items 2 and 3 above now confirm it with measurements, so it is recorded here as a **finding**:

- **Environment:** `packages/sentry/src/config.ts:14-17` guards every `process.env` read with `typeof process !== "undefined"`. In a browser bundle `process` is undefined, which defeats Vite's `NODE_ENV` inlining and forces the `"development"` literal.
- **Release:** `config.ts:18-20` yields `undefined` in the browser. `packages/sentry/src/react.ts:30` then passes `release: config.release` explicitly, and that key overwrites the SDK's own default, `WINDOW.SENTRY_RELEASE.id`. `sentryVitePlugin` already injects that global with the deployed SHA, which is the same release it uploads source maps under.

## Blast radius

- **Who:** all browser Sentry triage for marketing and rialto-web (project `mattbutlerengineering`) and hospitality (project `hospitality`), since the static Sentry wiring started reporting (around 2026-08). That covers 58 events in the last 14 days.
- **How badly:** nothing user-facing breaks and nothing is dropped. The events arrive, but mislabelled.
  - Environment filters hide or mix production browser errors.
  - Release-based features don't work for browser events: suspect commits, "resolved in next release", and per-release regression detection.
  - Source maps still resolve, by debug ID rather than release.
- **Shared code:** `packages/sentry/src/config.ts` (`resolveConfig`) is imported by:
  - `react.ts`, which runs in the browser. Its consumers are the four `apps/*/src/main.tsx` files (`initSentry`, `handleErrorBoundary`) and `apps/hospitality/src/hooks/useApiClient.ts` (`reportApiError`, which does not touch config).
  - `node.ts`, which runs in Node: `initSentry` (line 51) and `sentryFastifyPlugin` (line 134). Its consumers are `@mbe/service-bootstrap`'s `start-service-server.ts:44` and `create-service-app.ts:17`, which serve services/users, services/reservations and services/agent.

  Nothing else imports `@mbe/sentry` or `resolveConfig` (`git grep`, excluding llms and dep-graph).

- **Matchers:**
  - The heartbeat matches on its marker plus the `app` tag (`scripts/sentry-heartbeat.mjs:53-70`) and never reads environment or release.
  - `sentry-triage` (`.claude/skills/sentry-triage/scripts/triage.mjs:102`, `fetch-issues.mjs:21`) queries issues with no environment filter.
  - `infrastructure/pulumi/index.ts` defines no Sentry alert rule keyed on environment.

  So changing `development` to `production` breaks none of them. Not checked: any alert rules or inbound filters configured in the Sentry UI (see Notes).

- **Scale:** small. Two files in a private package plus one line per app. Review and Ship scale to that.

## Ruled out

- **Not a missing DSN or CSP block.** The events arrive (58 in 14 days); this is labelling only.
- **Not a missing release global.** `SENTRY_RELEASE={id:…}` is present in all three live entry chunks, so `sentryVitePlugin` injection works. No new `VITE_*` build var is needed for the release.
- **Not Vite failing to inline `NODE_ENV`.** It inlined `"production"`; the `typeof process` guard is what discards it.
- **Not something the heartbeat or triage depend on** (see Blast radius).
- **Not a changeset requirement.** `@mbe/sentry` is `private: true`, and the changeset gate covers rialto only.
- **In-flight check (from the brief, 2026-10-04): nothing matches.** Open PR #5999 matched only on the word "release" and is a deps GHSA ignore. Capture did not re-run the check, and the brief records that it ran.

## Work items

TDD order. Each item lists its acceptance criteria.

**Constraints for Implement:**

- Run `pnpm install --frozen-lockfile` and `pnpm build --filter @mbe/cli...` in the worktree first.
- Do **not** edit `packages/sentry/src/config.ts` or `packages/sentry/src/node.ts`.

- [x] **1. Failing tests first (RED)**: in `packages/sentry/src/react.test.ts`, add browser-shaped tests for `initSentry`:
  - (a) given `environment: "production"` in `InitOptions`, `Sentry.init` receives `environment: "production"` even with `process.env.NODE_ENV` / `SENTRY_ENVIRONMENT` deleted;
  - (b) when no release is resolvable (`SENTRY_RELEASE` and `npm_package_version` unset), the object passed to `Sentry.init` has **no own `release` key** (`expect(Object.hasOwn(arg, "release")).toBe(false)`). An `undefined` value does not count;
  - (c) when `process.env.SENTRY_RELEASE` is set, `release` is still passed through.
  - Accept: `pnpm --dir packages/sentry test` fails on (a) and (b) for the stated reason (not a compile or mock error) before any source change. Record the failure output in Verify.
- [x] **2. Release: stop overriding the SDK default.** In `packages/sentry/src/react.ts`, include `release` in the `Sentry.init` options only when `config.release` is defined, so `@sentry/browser`'s `applyDefaultOptions` falls back to `WINDOW.SENTRY_RELEASE.id`.
  - Accept: test 1(b) and 1(c) pass, and the existing react tests still pass.
- [x] **3. Environment: let the browser caller supply it.** Add an optional `environment?: string` to react.ts `InitOptions`, used in preference to `config.environment`.
  - Accept: test 1(a) passes, and the existing `defaults environment to 'development'` / `NODE_ENV` / `SENTRY_ENVIRONMENT` react tests still pass unchanged (no caller-supplied environment means the old behaviour).
- [x] **4. Wire the apps.** Pass `environment: import.meta.env.MODE` in the `initSentry({...})` call of `apps/marketing/src/main.tsx`, `apps/rialto-web/src/main.tsx` and `apps/hospitality/src/main.tsx`, plus `apps/gen/src/main.tsx` as the sibling sweep.
  - Accept: `pnpm typecheck` passes for all four apps.
  - Accept: a local production build `pnpm build --filter=@mbe/marketing` with `VITE_SENTRY_DSN=https://k@o0.ingest.sentry.io/0` set and no `SENTRY_AUTH_TOKEN` emits a chunk whose `initSentry` call passes `environment` resolved from mode `production`, and whose `Sentry.init` argument is built without an unconditional `release:` key. Grep the emitted `dist/assets/*.js` and quote the matched snippet in Verify.
- [x] **5. Backend unchanged (guard).**
  - Accept: `git diff origin/main -- packages/sentry/src/config.ts packages/sentry/src/node.ts packages/service-bootstrap services` prints nothing.
  - Accept: `packages/sentry/src/config.test.ts` and `node.test.ts` pass **unmodified**, including `node.test.ts:105-115` (`environment: "production"` from `NODE_ENV`) and `config.test.ts:55-70` (`development` default, `SENTRY_RELEASE` / `npm_package_version` release).
  - Accept: `pnpm --dir packages/service-bootstrap test` passes.
- [x] **6. Gates.** Run `pnpm --dir packages/sentry test`, `pnpm lint`, `pnpm typecheck`, the apps' tests (`pnpm --dir apps/hospitality test`, marketing, rialto-web) and `/local-ci-precheck`, then regen any llms drift (`pnpm build --filter @mbe/cli... && pnpm regen`) and stage it by explicit path.
  - Accept: all green; no changeset added, because the package is private.

**Release steps (Ship, in prose, not checkboxes):**

- `packages/sentry/**` is not in `deploy-static.yml`'s push `paths:`, but the four `main.tsx` edits are. A merge touching `apps/marketing|hospitality|rialto-web/**` therefore triggers it. The brief still authorizes and requires an explicit `deploy-static.yml` `workflow_dispatch` on `main`, so Ship confirms all three deploy jobs ran on the merge SHA (dispatching if any were skipped).
- Ship then dispatches `sentry-heartbeat.yml` once and proves it live. Through Sentry MCP, the new heartbeat events in `hospitality` and `mattbutlerengineering` must show `environment: production` and `release: <merge SHA>`, matching the `SENTRY_RELEASE` id grepped from each newly deployed entry chunk.
- Ship also re-runs the step-1 table query to confirm the node rows are still `production` / `null`.
- No `deploy-services.yml` run is needed or authorized: the backend is unchanged by construction.

## Notes

- **Mechanism rejected:** deleting the `typeof process` guard in `config.ts`.
  - The live bundle shows Vite would then inline `"production"`, which would fix the environment with a smaller diff.
  - It was rejected because it edits the file the backend shares, makes correctness depend on Vite's implicit `process.env` → `{}` substitution, and risks a `ReferenceError` in any browser context that lacks that substitution.
  - The chosen mechanism leaves `config.ts` and `node.ts` untouched, so "backend byte for byte unchanged" holds by construction rather than by argument.
- **Which file ships:** `@mbe/sentry`'s exports map sends the `production` condition to `./dist/react.js`. turbo's `^build` rebuilds that dist before the app build in CI. Item 4's local-build grep is what proves the shipped bundle contains the change, so don't trust a stale local `dist`.
- **Backend release is also `null`** (users-api, agent-api, reservations-api; table above). Services run `node` directly in Docker, so `npm_package_version` is unset, and `SENTRY_RELEASE` is not set either. This is out of scope here, because changing it would alter backend behaviour. It is a candidate backlog seed for Operate.
- **Unmeasured gap:** alert rules or inbound data filters configured in the Sentry UI that key on `environment:development` / `production` were not enumerated. The only rules in code (Pulumi) have none. Ship should glance at each project's alert rules before calling the change inert to alerting.
- **SDK version caveat:** the live marketing and rialto-web bundles (release `4402db76`) predate the v11 bump (#6009). Hospitality (`728517fe`, #6032) runs v11. The `applyDefaultOptions` spread order was read from 11.4.0, the locked version that the fix will ship with.

## Implement notes (2026-10-04)

Evidence for each checked box, from real command output in the worktree (`fix/browser-sentry-env-release`, cut from `802d78175`). Setup: `pnpm install --frozen-lockfile` exit 0; `pnpm build --filter @mbe/cli...` 6/6 tasks.

- **Box 1 (RED).** Added a `describe("in a browser bundle (no process.env values)")` block to `react.test.ts` with tests (a), (b), (c); it also deletes `npm_package_version`, which `pnpm test` sets. `pnpm --dir packages/sentry test` before any source change: `Tests 2 failed | 62 passed (64)`. The failures were assertions, not compile or mock errors:
  - (a) `uses the caller-supplied environment`: `AssertionError: expected 'development' to be 'production'`;
  - (b) `omits the release key ...`: `expected true to be false` (an own `release` key was present).
  - (c) passed from the start, as intended: it pins the pass-through.
- **Box 2 (release).** `react.ts` now spreads `...(config.release !== undefined && { release: config.release })`. Result: `1 failed | 63 passed`; only (a) is still red.
- **Box 3 (environment).** Added `environment?: string` to `InitOptions`, used as `options.environment ?? config.environment`. Result: `Tests 64 passed (64)`, and `pnpm --dir packages/sentry typecheck` exits 0. The existing `defaults environment to 'development'`, `passes environment from NODE_ENV` and `uses SENTRY_ENVIRONMENT` tests are unmodified and pass.
- **Box 4 (apps).** All four `main.tsx` files now pass `environment: import.meta.env.MODE`.
  - Typecheck: `pnpm turbo typecheck --filter` across gen, marketing, hospitality, rialto-web and sentry gave `14 successful, 14 total`. A first per-app `pnpm --dir apps/<a> typecheck` exited 2, but only on `Cannot find module '@mattbutlerengineering/rialto'`, because rialto `dist` was absent in the fresh worktree; none of the errors touched `environment`. Turbo builds `^build` deps first.
  - Build probe: `rm -rf apps/marketing/dist packages/sentry/dist`, then `env -u SENTRY_AUTH_TOKEN VITE_SENTRY_DSN=https://k@o0.ingest.sentry.io/0 pnpm turbo build --filter=@mbe/marketing --force` gave `7 successful`, with `@mbe/sentry` dist rebuilt fresh. `SENTRY_AUTH_TOKEN` was absent from the environment (`env | grep -c` = 0), so `sentryVitePlugin` was disabled and nothing reached sentry.io. Emitted `apps/marketing/dist/assets/index-fe7BuGPe.js`:
    - call site: ``Kf({appName:`marketing`,dsn:`https://k@o0.ingest.sentry.io/0`,environment:`production`})``
    - init: ``function Kf(e){let t=Gf(e.dsn);t.enabled&&(Uf({dsn:t.dsn,environment:e.environment??t.environment,...t.release!==void 0&&{release:t.release},replaysSessionSampleRate:0,replaysOnErrorSampleRate:0,integrations:[]}),fc(`app`,e.appName))}``
    - So the environment resolves from mode as literal `production`, and there is no unconditional `release:` key. The local bundle carries no `SENTRY_RELEASE={id:…}` global because the plugin is disabled without a token. That global's presence in CI-built bundles is the Capture measurement (evidence item 2) and is Ship's live proof to make.
- **Box 5 (backend guard).** `git diff origin/main -- packages/sentry/src/config.ts packages/sentry/src/node.ts packages/service-bootstrap services` printed nothing (0 bytes). `git diff origin/main --stat` on `config.test.ts` and `node.test.ts` is empty (unmodified), and `vitest run src/config.test.ts src/node.test.ts` gave `Tests 35 passed (35)`. `pnpm --dir packages/service-bootstrap test` gave `Tests 173 passed (173)`.
- **Box 6 (gates).**
  - `pnpm --dir packages/sentry test` 64/64.
  - `pnpm lint` `52 successful, 52 total`; `pnpm typecheck` `52 successful, 52 total`.
  - `check-adr` "No architectural violations detected"; `check-deps` "All external dependencies are consistent".
  - App tests: hospitality `2523 passed (2523)`, marketing `365 passed (365)`, rialto-web `770 passed (770)`.
  - `pnpm regen` exit 0, which regenerated `llms.txt`, `llms-full.txt` and `packages/sentry/llms{,-full}.txt` (the `environment?: string` field). These are staged by explicit path.
  - No changeset was added (`@mbe/sentry` is private).
