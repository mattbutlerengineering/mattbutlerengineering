---
stage: review
run: maintenance:backend-observability-blackout
date: 2026-09-02
---

# Review: turn on the observability that already exists

## Scope

The diff this run produced: `37a1c1662..397e4aa3f`, i.e. PRs #4920 (the fix),
#4927 (the deploy-crash follow-up), #4929 and #4930 (run artifacts) — 31 files,
+1139/-80 excluding `docs/**` and generated `llms*.txt`.

The load-bearing surface, read line by line:

| File                                                        | What it does                                           |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| `packages/observability/src/redact.ts`                      | new — the single decision about what may leave the box |
| `packages/sentry/src/node.ts`                               | `beforeSend`, integration filter, tracing left unset   |
| `packages/service-bootstrap/src/validate-startup-config.ts` | production boot refuses an absent DSN                  |
| `infrastructure/pulumi/index.ts`                            | `sentryDsnByService` → `secretEnv("SENTRY_DSN", …)`    |
| `.github/workflows/deploy-services.yml`                     | guard step + three per-service `yq` upserts            |
| `scripts/require-deploy-secrets.mjs`                        | new — the fail-closed guard                            |
| `scripts/sentry-round-trip.mjs`                             | new — the repeatable live check                        |
| `scripts/check-workflow-paths-coverage.mjs`                 | one allowlist entry                                    |

Verify already proved the behaviour end to end against production; this pass
does not re-verify it. Scaled per the protocol's maintenance-run rule: the blast
radius is diagnostic capability plus a boot-critical config path, so the
security pass got full weight and the correctness pass was scoped to the new
code rather than the whole telemetry stack.

## Findings

### Major: the parsed `cookies` map Sentry writes alongside the raw header was not redacted

- Scenario: `@sentry/core@10.70.0`'s `RequestData` integration writes **two**
  copies of the same credential — `event.request.headers.cookie` (the raw
  header) and `event.request.cookies`, a parsed map keyed by cookie **name**
  (`requestdata.js:133-134`). `redactSignal` matched only credential _header
  names_, so `cookie` was replaced and `cookies` was walked as an ordinary
  object: its keys (`session`, `connect.sid`) match no rule and a session id is
  not secret-_shaped_, so every value passed through untouched. A logged-in
  request producing a 5xx would have shipped its session cookie to Sentry with
  the header beside it dutifully redacted.
- Why it had not fired: nothing currently populates
  `sdkProcessingMetadata.normalizedRequest`. Measured, not assumed — the three
  live round-trip events carry no `request` section at all, because
  `skipOpenTelemetrySetup: true` with tracing unset leaves no instrumentation
  binding the incoming request. `RequestData` **is** among the 17 default
  integrations (probed against the installed SDK), and `include.cookies`
  resolves to `dataCollection.cookies !== false`, which is true by default
  without `sendDefaultPii`. So the mechanism is loaded and armed; only its input
  is missing. **Milestone 2 turns OTel on. That is the moment this activates** —
  a latent leak timed to switch on in the follow-up run, in a policy whose whole
  premise is that one rule governs every outbound signal.
- Decision: **fixed.** `CREDENTIAL_HEADERS` became `CREDENTIAL_KEYS` with
  `cookies` added, so the whole subtree is replaced without inspecting it.
  Test-first: `redactSignal > strips the parsed cookies object Sentry writes
alongside the raw header` failed with
  `expected { session: 'abc123', …(1) } to be '[redacted]'`, then passed.
  Fixed rather than deferred because it is one line in a file this run created,
  and deferring it would have parked a known credential leak in the exact place
  the follow-up run switches the mechanism on.

### Major: the merge that ended the blackout deployed nothing

- Scenario: `deploy-services.yml`'s `paths:` filter listed `services/*`,
  `packages/types`, `packages/auth`, `packages/agent-core` and
  `packages/observability`. #4927 changed `packages/sentry` only. It merged
  green and triggered **no deploy at all**; the production crash it fixed stayed
  live until a manual `gh workflow run`. `packages/service-bootstrap` — which
  owns `createServiceApp` and the new boot-time DSN check — had the same gap.
  Any future fix to either merges and silently does not ship.
- Why the existing guard could not catch it: `check-workflow-paths-coverage.mjs`
  derives a workflow's exercised surface from path tokens in its `run:` blocks
  and states, in its own header, that transitive dependencies are not modeled.
  Neither package is ever _named_ by this workflow — they arrive inside the
  Docker images it deploys. This is that documented blind spot, met in the wild.
- Decision: **fixed.** Both packages added to the trigger, pinned by a new
  assertion in `scripts/__tests__/require-deploy-secrets.test.mjs`
  (`triggers on the packages whose code the deployed services boot with`), which
  reads the real workflow file and runs on every PR. RED→GREEN confirmed.

### Minor: secret values are interpolated into the `yq` expression by the shell

- Scenario: the upserts build a `yq` program by shell-expanding
  `${SENTRY_DSN_USERS_API}` inside a double-quoted string containing escaped
  JSON. A value carrying `"` or `\` would corrupt the expression rather than
  land as data. Sentry DSNs are URLs and the values come from repository secrets
  the maintainer sets, so this is a robustness issue, not a live injection path.
- Decision: **deferred.** The robust form is `yq`'s `strenv(VAR)`, which takes
  the shell out of the loop entirely — but the two pre-existing secrets
  (`MANAGE_TOKEN_SECRET`, `UNSUBSCRIBE_TOKEN_SECRET`) use the identical pattern,
  and this run's new code matched the codebase rather than diverging from it.
  Converting all five belongs in one deliberate change to the deploy path, not
  folded into a maintenance run. Seeded for the backlog at Operate.

### Minor: `SENTRY_DSN` now preempts the auth check in `validateStartupConfig`

- Scenario: the new check runs first, so a production deploy missing **both**
  `SENTRY_DSN` and `AUTH_AUTHORITY` reports only the DSN. The operator fixes it,
  redeploys, and hits the auth failure on the second attempt.
- Decision: **deferred.** Both paths fail closed and each message names its own
  variable, so the cost is one extra deploy cycle in a case that has never
  occurred. Collecting all startup-config failures before throwing would be the
  better shape, but it is a change to shared boot behaviour beyond this run's
  scope. `services/users/src/routes/users.test.ts` already documents the
  ordering in place.

## Passes with no findings

- **Correctness.** `redactSignal` is a pure, non-mutating recursive copy whose
  base cases were checked against the real event shapes: plain objects and
  arrays are walked, everything else (Date, Buffer, Error, Map) passes through
  rather than being rebuilt lossily, and `does not mutate its input` is pinned
  by test. `require-deploy-secrets.mjs` distinguishes unset / empty /
  whitespace-only with three different messages, reports **every** failure
  rather than the first, and its four input shapes were exercised by running the
  CLI. `roundTripExitCode` maps anything unrecognised to 2, so a transport
  failure can never be read as "no event found".
- **Design.** Matches `architecture.md`: one redaction owner
  (`grep` confirms exactly one `beforeSend` and one `redactSignal` definition in
  the repo), per-service DSNs rather than a shared one, the guard as a pure
  unit-tested function with a thin CLI, and the `yq` bridge extended rather than
  replaced. The three upserts are deliberately not a loop, and the comment says
  why — a loop over a shared value is the design that was rejected. The
  `check-workflow-paths-coverage.mjs` allowlist entry argues its case instead of
  just silencing the check, and correctly notes the guarded surface is pinned by
  a test that reads the real workflow.
- **Security.** No secret is committed: every DSN arrives as
  `${{ secrets.* }}` or `config.getSecret`, and all three land as `type: SECRET`
  in the app spec (confirmed against the live spec). The boot error deliberately
  never echoes the value — pinned by `never names the DSN value in the error,
only that it is missing`. `initSentry` still returns early when the DSN is
  absent, so dev and test need no credential. The one credential-exposure path
  found is the `cookies` finding above, now fixed.

## Verdict

**Ready to ship.** Two majors found, both fixed in this pass with tests; two
minors deferred with reasons recorded. Gates after the fixes:
`packages/observability` 87 pass, `packages/sentry` 58 pass, the two script
suites 32 pass, `check-workflow-paths-coverage.mjs` PASS, eslint and tsc clean
on the changed files.

The `verification.md` FAIL (T2 — a successful request still leaves no durable
record) is unchanged and unaddressed here by design: it is the descoped
Milestone 2/3 access-log leg, not a defect in this diff.
