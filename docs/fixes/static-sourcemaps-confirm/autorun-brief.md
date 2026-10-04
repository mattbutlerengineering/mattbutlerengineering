# Autorun brief — static-sourcemaps-confirm

Collected 2026-10-03 from Matt (two answered questions) plus evidence the orchestrator
measured. This file is not a pipeline artifact.

## Run

- **Scale:** maintenance run, defect brief, slug `static-sourcemaps-confirm`, in
  `docs/fixes/static-sourcemaps-confirm/`. Enters at Capture.
- **Worktree and branch:** `.claude/worktrees/static-sourcemaps-confirm` on branch
  `fix/static-sourcemaps-confirm`, cut from `origin/main` @ `f43465f5f`. Never use the main
  checkout.
- **Origin seed:** `docs/backlog.md` line ~40, "Confirm source maps upload and produce
  readable stack traces". Claim it in place. Also the open item in
  `docs/fixes/static-sentry-dsn-routing/release.md` and its review minor 3.
- **In-flight check (ran 2026-10-03):** no open PR mentions sentry, source maps, or vite.
  Nothing matches.
- **Tracker:** none.

## Defect / open question

- **Unverified claim:** marketing and rialto-web source maps upload to the Sentry project
  `mattbutlerengineering`, and their production errors symbolicate. Hospitality's maps
  (project `hospitality`) are unverified too. Include hospitality in the measurement, and
  fix it only if the same root cause applies.
- **Measured so far (2026-10-03):**
  - deploy-static run 37096660655 (headSha `2de5105b6`) built all three apps with
    `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` in env (values masked).
  - That vite output contains **no** sentryVitePlugin lines at all, neither upload nor
    error. The plugin is silent unless it fails or runs in debug, so the log proves nothing
    either way.
  - All three `vite.config.ts` files pass `process.env.SENTRY_PROJECT` to `sentryVitePlugin`
    (`^5.4.0`), with `disable: !process.env.SENTRY_AUTH_TOKEN`.
  - Heartbeat events reach `mattbutlerengineering` correctly: runs 37096854810 and the
    17:28Z scheduled run were green. **But heartbeat events cannot prove symbolication.**
    The error is thrown from Playwright-injected code (`page.evaluate` → `setTimeout`), so
    its frames are not bundle frames. The run needs a different probe, such as Sentry's
    debug-ID / release-artifact API, an event raised from bundle code, or the plugin's
    debug output.
- **Hypotheses (unverified):**
  1. The upload works, and nothing is wrong except that nobody has checked.
  2. `SENTRY_AUTH_TOKEN` lacks `project:releases` / `project:write` on
     `mattbutlerengineering`, or is org-scoped wrongly. The plugin may then fail silently
     unless `errorHandler` / `debug` is set.
  3. The `SENTRY_PROJECT` secret for hospitality has an unknown value.
- **Blast radius:** every production JS error from the three static apps may arrive
  minified, which makes triage much slower. This has been in place since the static
  Sentry wiring (~2026-08), and since 2026-10-03 for the re-routed apps.
- **Also known:** browser events report `environment: development` with no release. That
  is a separate backlog seed and out of scope. Don't fix it here unless the source-map
  fix requires it.

## Release authorization (Matt, 2026-10-03)

- **May, without asking:**
  - query Sentry read-only (Sentry MCP tools, or the API with tokens already available);
  - open a PR;
  - squash-merge it once the reviewer passes it, `CI Gate` is green on the final head,
    and no critical finding is left unfixed. Pass `--subject` explicitly at merge time;
  - dispatch `deploy-static.yml` on main through CI, since merges touching only
    `.github/**`/`scripts/**` don't auto-deploy;
  - re-measure afterwards.
- **Must STOP and surface to Matt:** anything touching credentials. That covers creating,
  rescoping, or replacing `SENTRY_AUTH_TOKEN`, and any `gh secret set`. Write the exact
  steps into `release.md` instead.
- A diagnosis-only outcome is valid: "uploads work, here is the proof" ships as
  `release.md` with no code change. Don't invent a code change to have something to merge.

## Scope

- **In:**
  - prove upload and symbolication for marketing, rialto-web, and hospitality;
  - if broken for a non-credential reason, fix it (plugin config, env, a guard so a
    failed upload is no longer silent), with TDD;
  - optionally make upload failure loud in CI, e.g. `errorHandler` that fails the build,
    or a post-build artifact check. That counts as a fix only if justified by evidence.
- **Out:** the `environment`/release tagging seed, the CSP `eval` seed, heartbeat changes,
  and anything touching credentials (stop and surface instead).
- **User-facing surface:** none.

## Constraints

Repo gotchas apply:

- TDD;
- `set -o pipefail` in any `run:` block whose exit code matters;
- no `status` shell variable;
- stage files by explicit path;
- never pipe `git push`;
- prettier-format docs;
- `pnpm install --frozen-lockfile` plus `pnpm build --filter @mbe/cli...` in a fresh
  worktree before committing, because the pre-commit `check-adr` needs it.

Use Sentry MCP (org `mattbutlerengineering`, region `https://us.sentry.io`) for read-only
measurement. There is no local `SENTRY_AUTH_TOKEN`.
