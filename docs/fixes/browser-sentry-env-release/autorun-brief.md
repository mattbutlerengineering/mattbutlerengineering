# Autorun brief: browser-sentry-env-release

Collected 2026-10-04 from Matt (two answered questions), plus evidence the
orchestrator measured. This is not a pipeline artifact.

## Run

- **Scale:** maintenance run (defect brief), slug `browser-sentry-env-release`, in
  `docs/fixes/browser-sentry-env-release/`. It enters at Capture.
- **Worktree / branch:** `.claude/worktrees/browser-sentry-env-release`, branch
  `fix/browser-sentry-env-release`, cut from `origin/main` @ `802d78175`. Never use the
  main checkout.
- **Origin seed:** `docs/backlog.md` line ~38, "Make browser Sentry events report the
  real environment and release". Claim it in place.
- **In-flight check (ran 2026-10-04):** open PR #5999 matched only on the word "release".
  It is a deps GHSA ignore. Nothing matches.
- **Tracker:** none.

## Defect

- **Observed:**
  - Every production browser Sentry event from marketing, rialto-web and hospitality
    reports `environment: development` and `release: null`. Measured 2026-10-01 on the
    heartbeat spike events in `HOSPITALITY-B`, and again in the sentry-silence-alert
    Verify.
  - As a result, production browser errors can't be filtered from dev ones, and they
    aren't tied to the deployed release.
- **Expected:**
  - Production browser events carry `environment: production`.
  - They carry `release: <deployed git SHA>`, the same release name `sentryVitePlugin`
    now creates and uploads source maps under (see
    `docs/fixes/static-sourcemaps-confirm/release.md`; e.g. release `4402db76…` exists
    in projects `mattbutlerengineering` and `hospitality`).
- **Root cause (code read by the orchestrator; Capture must confirm):**
  - `packages/sentry/src/config.ts` `resolveConfig()` reads
    `process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development"` and
    `process.env.SENTRY_RELEASE ?? process.env.npm_package_version`.
  - The code is guarded by `typeof process !== "undefined"`. In a Vite browser bundle,
    `process` is undefined, so it falls back to `"development"` / `undefined`.
- **Hypotheses (unverified):**
  - The plugin already injects a `SENTRY_RELEASE` global into bundles: the Ship probe
    saw `SENTRY_RELEASE={id:"4402db76…"}` in the live entry chunk. The SDK may pick up
    the release by itself if `release` is left unset rather than passed as `undefined`.
  - Vite exposes `import.meta.env.MODE` / `PROD`. A `VITE_*` build var could carry the
    environment.
  - Capture/Implement decide the mechanism from code and docs, not guesses.
- **Shared-code constraint:**
  - `packages/sentry` is also used by backend services (Node, where `process.env` is
    real).
  - The fix must leave backend Sentry behavior byte-for-byte unchanged, or the run must
    explicitly flag that it changes. Check every importer of `resolveConfig` and of the
    package.
- **Blast radius:**
  - All browser Sentry triage since the static Sentry wiring (~2026-08).
  - The heartbeat matcher (`scripts/sentry-heartbeat*.mjs`) and `sentry-triage` may key
    on environment or release. Check they don't break when environment becomes
    `production`.

## Release authorization (Matt, 2026-10-04)

May, without asking:

- open a PR, and squash-merge it once the reviewer passes it, `CI Gate` is green on the
  final head, and there is no unfixed critical. Use an explicit `--subject`;
- dispatch `deploy-static.yml` on main through CI. This is required:
  `packages/sentry/**` is NOT in its push paths filter;
- query Sentry read-only;
- dispatch `sentry-heartbeat.yml` once afterward, as live proof that browser events
  carry the new environment and release.

Must STOP and surface to Matt:

- If the change alters backend service Sentry behavior and therefore needs a
  `deploy-services.yml` run: do not dispatch it. Write the steps into `release.md`.
- Anything touching credentials or secrets.

## Scope

- **In:**
  - browser environment and release resolution for the three static apps;
  - tests;
  - keeping backend behavior unchanged;
  - checking the heartbeat and triage matchers still work.
- **Out:**
  - the deploy-static paths-filter gap for `packages/sentry/**`. That is a separate seed;
    do not fix it here, just dispatch;
  - the CSP `eval` seed;
  - the `verify-push-sha` hook bug.
- **User-facing surface:** none.

## Constraints

- Repo gotchas apply: TDD; `set -o pipefail`; no `status` shell var; explicit-path
  staging; never pipe `git push`; prettier-format docs.
- A fresh worktree needs `pnpm install --frozen-lockfile` and
  `pnpm build --filter @mbe/cli...` before committing.
- `packages/sentry` may be a published or versioned package: check whether a changeset
  is required (gotchas § Releases). Rialto needs one; confirm whether `@mbe/sentry` does.
- Use Sentry MCP for read-only measurement: org `mattbutlerengineering`, region
  `https://us.sentry.io`. There is no local `SENTRY_AUTH_TOKEN`.
