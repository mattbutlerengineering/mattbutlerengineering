---
stage: review
run: maintenance:browser-sentry-env-release
date: 2026-10-04
assumptions:
  - "Severity arbitration: the skill asks the user to arbitrate severity, and the brief is silent on it. Review's own draft severities stand as final (no critical, no major, three minor). Matt can re-rank at Ship."
  - "Scale: maintenance run, small blast radius (one private package's browser entry plus four one-line app call sites). Per the protocol's Run scale section this is a light pass; Verify's regression tests are the floor and were re-run here rather than re-derived."
  - "Minor finding 1 (stale package CLAUDE.md example) was fixed in-stage because it is doc-only and touches nothing generated (`pnpm regen --check` clean afterwards). TDD does not apply to a prose example."
---

# Review: production browser Sentry events report `environment: development` and `release: null`

## Scope

Diff `origin/main...fix/browser-sentry-env-release` (merge-base `802d78175`, head `e6fa4ec14` at the start of Review), 14 files:

- `packages/sentry/src/react.ts` (+8/-2): new optional `InitOptions.environment`; `release` spread only when resolved.
- `packages/sentry/src/react.test.ts` (+34): three browser-shaped tests.
- `apps/{gen,hospitality,marketing,rialto-web}/src/main.tsx` (+1 each): `environment: import.meta.env.MODE`.
- `llms.txt`, `llms-full.txt`, `packages/sentry/llms{,-full}.txt`: regen output for the new field.
- `docs/backlog.md` (seed claimed), `docs/fixes/browser-sentry-env-release/*` (run artifacts).

Re-run by Review in the worktree, 2026-10-04:

- `pnpm --dir packages/sentry test`: `Tests  64 passed (64)`; `pnpm --dir packages/sentry typecheck`: exit 0.
- `node tools/cli/dist/index.js check-adr`: `Checking codebase against 1 active ADRs... ✅ No architectural violations detected.`
- `pnpm regen --check`: `All generated artifacts are up to date.` (before and after the Review fix).
- Independent RED check: swapped `origin/main`'s `react.ts` into the worktree, ran `vitest run src/react.test.ts`, restored with `git checkout` (`git status --short packages/sentry` empty afterwards):

  ```
  × uses the caller-supplied environment 4ms
  × omits the release key so the SDK falls back to the plugin-injected SENTRY_RELEASE 1ms
  AssertionError: expected 'development' to be 'production' // Object.is equality
  AssertionError: expected true to be false // Object.is equality
        Tests  2 failed | 27 passed (29)
  ```

  Both new tests fail on the old code on assertions, not on compile or mock errors. Test (c) passes on old code by design (it pins the pass-through).

## Key questions

**1. Does omitting `release` really let the SDK fall back to the `SENTRY_RELEASE` global?** Yes. The lockfile resolves `@sentry/react`, `@sentry/browser` and `@sentry/core` to 11.4.0. Read from this worktree's `node_modules/.pnpm/@sentry+browser@11.4.0/node_modules/@sentry/browser`:

- `build/npm/esm/prod/client.js:13`: `const opts = applyDefaultOptions(options);` (the `BrowserClient` constructor).
- `build/npm/esm/prod/client.js:67-75`:

  ```js
  function applyDefaultOptions(optionsArg) {
    return {
      release: typeof __SENTRY_RELEASE__ === "string" ? __SENTRY_RELEASE__ : WINDOW.SENTRY_RELEASE?.id,
      ...
      ...optionsArg
    };
  }
  ```

  `optionsArg` spreads last, so an own `release: undefined` key overwrites the default and an absent key keeps it. `build/npm/esm/dev/client.js:69` is identical, so the Vite export condition does not matter.

- `@sentry/react/build/esm/sdk.js:6-12` copies options with `{ ...options }` and `@sentry/browser/build/npm/esm/prod/sdk.js:38-44` spreads `...options` into `clientOptions`. Neither strips or adds `release`.
- `@sentry/core@11.4.0/build/esm/utils/prepareEvent.js:74-77`: `if (!event.release && release) event.release = release;`, and line 75 sets `event.environment = event.environment || environment || DEFAULT_ENVIRONMENT` (`constants.js:1`: `"production"`).

The emitted bundle in Implement's build probe has `...t.release!==void 0&&{release:t.release}`, so the own key is absent when unresolved.

**2. Does anything import `react.ts` from Node or SSR?** No. `git grep "@mbe/sentry"` (excluding llms, docs, lockfile, manifests) finds `@mbe/sentry/react` imported only by the four `apps/*/src/main.tsx` and `apps/hospitality/src/hooks/useApiClient.ts` (`reportApiError` only, untouched). No app Vite config or manifest mentions `ssr`, `renderToString` or `prerender`. `import.meta.env.MODE` appears only in the app entry files, which Vite always defines. In app vitest runs MODE is `test`, but `main.tsx` is not imported by tests and the DSN is empty there anyway.

**3. Is the backend untouched?** Yes. `git diff origin/main...HEAD --stat -- packages/sentry/src/config.ts packages/sentry/src/node.ts packages/service-bootstrap services packages/sentry/src/config.test.ts packages/sentry/src/node.test.ts` prints 0 bytes. `node.ts` has its own `InitOptions` (`serviceName`) and never imports `react.ts`. `@mbe/sentry`'s `.` entry exports only `resolveConfig` and `SentryConfig`.

**4. Any unwired `initSentry` caller?** No. `git grep -n "initSentry("` finds the four app call sites (all wired), `start-service-server.ts:48` (the node variant, out of scope), tests, and the package CLAUDE.md example (stale; minor finding 1, fixed).

**5. Test quality.** The tests fail on the old code for the stated reason (independent RED above). Test (b) asserts `Object.hasOwn(arg, "release") === false`, which is the right assertion: a `toBeUndefined()` check would pass on the old code. The nested block deletes `npm_package_version` and restores it, and the outer `afterEach` restores the `SENTRY_RELEASE` that test (c) sets. No leakage.

**6. llms regen consistency.** `pnpm regen --check` is clean. The four llms diffs only add the `environment?: string` field and its doc comment.

**7. ADR compliance.** `check-adr` is clean. The one active ADR is not touched by this diff.

## Findings

### Minor 1: the package's React usage example would reproduce the defect in a new app

- Scenario: `packages/sentry/CLAUDE.md` § React Integration showed `initSentry({ appName: "hospitality", dsn: process.env.SENTRY_DSN })`. An agent scaffolding a new static app from that example gets an empty DSN in the browser (`process.env` is undefined in a Vite bundle) and, with a DSN, `environment: development`, which is this run's defect. § Config Resolution also described only the `process.env` path. This is a decayed contract: the package's agent-facing doc no longer matches its real call sites.
- Standard: none (`docs/standards.json` is not present in this repo).
- Decision: **fixed** in this stage. The example now matches the four real call sites (`dsn: import.meta.env.VITE_SENTRY_DSN, environment: import.meta.env.MODE`), and one paragraph under Config Resolution explains the browser path. Prettier-clean. `pnpm regen --check` after the edit: `All generated artifacts are up to date.`

### Minor 2: the release fallback is proven by SDK source and a bundle grep, not by a deployed event

- Scenario: unit tests mock `@sentry/react`, so they prove the own key is absent but not that a real event carries the SHA. The fallback also depends on `sentryVitePlugin`'s `SENTRY_RELEASE={id:…}` snippet running before `Sentry.init` in the entry chunk. The snippet sits in the entry chunk body (Capture evidence item 2) and the `initSentry` call is in `main.tsx`'s body after the imports, so the order should hold. A local build without `SENTRY_AUTH_TOKEN` disables the plugin, so no local artifact can show both together.
- Standard: none.
- Decision: **deferred to Ship**, which already plans the proof: dispatch `sentry-heartbeat.yml` and confirm through Sentry MCP that the new events show `environment: production` and `release: <merge SHA>` matching the `SENTRY_RELEASE` id in the deployed chunk. If the release is still `null` there, the run re-enters at Implement.

### Minor 3: caller-supplied `environment` takes precedence over `SENTRY_ENVIRONMENT`

- Scenario: `options.environment ?? config.environment` means a Node-side caller of `@mbe/sentry/react` that passed `environment` could not override it through `SENTRY_ENVIRONMENT`. No such caller exists (finding 2 above: browser-only importers, where `process.env` is absent anyway), so nothing goes wrong today. The JSDoc states the intended browser use.
- Standard: none.
- Decision: **deferred, no action**. Making the env var win would re-couple the browser path to `process.env`, which is the defect's mechanism. Recorded only so a future Node caller is not surprised.

### Note for Ship (not a finding): `Visual Regression (hospitality)` is red on PR #6035, and it predates this PR

- Observed: run `37222267438` (Apps Visual Regression, head `e6fa4ec14`) has 2 failures, both `apps/hospitality/e2e/visual.spec.ts:273:5 › dashboard @ 1280x720` and `› dashboard @ 375x812`.
- Main comparison: the latest `Apps Visual Regression` run on `main`, `37213913183` at `728517fe5` (#6032, an ancestor of the merge-base `802d78175`), fails on exactly the same two specs. So this was main drift before this branch existed. This diff changes no rendered UI: it only touches the `initSentry` options.
- Required contexts on `main` are `["CI Gate"]` only (`gh api .../branches/main/protection/required_status_checks`), so this check is advisory.
- Decision: Ship triages it as pre-existing advisory drift and does not gate on it. Fixing the baselines is out of scope for this run.

## Passes with no findings

- **Correctness:** clean apart from Minor 2, which is a deferred live proof rather than a defect. Empty-string MODE cannot occur (Vite always sets it), and the `false` spread for an unresolved release is valid JS and TS.
- **Design:** matches defect.md's chosen mechanism (config.ts and node.ts untouched, app passes MODE). The only drift was the doc example in Minor 1, now fixed. `apps/gen` is included as a sibling sweep. It is not deployed by `deploy-static.yml` and is harmless.
- **Security:** no secrets; no new input surface. `environment` is a build-time constant inlined by Vite. No changeset is needed: `@mbe/sentry` is `"private": true`.

## Reviewer gate (inline, `reviewer` rubric)

Checked against defect.md's work-item acceptance criteria:

| Item            | Criterion                                                                  | Result                                                                                 |
| --------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1 RED           | (a), (b) fail for the stated reason on pre-fix code; (c) pins pass-through | Met: reproduced independently (assertion failures, 2 failed / 27 passed)               |
| 2 release       | no own `release` key when unresolved; pass-through kept                    | Met: `react.ts:38`; tests pass                                                         |
| 3 environment   | optional `environment`, old tests unchanged                                | Met: existing `development` / `NODE_ENV` / `SENTRY_ENVIRONMENT` tests unmodified, pass |
| 4 apps          | MODE wired in 4 apps, typecheck, bundle grep                               | Met: diff shows all 4; bundle snippet quoted in defect.md Implement notes              |
| 5 backend guard | zero diff to config/node/service-bootstrap/services                        | Met: 0-byte diff re-measured                                                           |
| 6 gates         | tests, lint, typecheck, regen, no changeset                                | Met: sentry tests 64/64, typecheck 0, check-adr clean, regen clean                     |

- Hallucinations: none. Every SDK claim was re-read at file:line from the installed 11.4.0 copy in this worktree.
- Regressions: none found. The backend is byte-identical, and the browser default path (no `environment` passed) keeps the old behaviour per the unchanged tests.
- Gate bypasses: none. No `--no-verify`, skipped tests, or edited baselines.
- Criteria gaps: the live proof that events carry the SHA is a Ship step by design (Minor 2).

**Score: 9/10, PASS.** The point withheld is the unproven live release attribution, which Ship owns.

## Verdict

No critical findings, so nothing unfixed blocks Ship. There are no majors. Minor 1 is fixed. Minors 2 and 3 are deferred with reasons: 2 is Ship's live proof, and 3 needs no action. Ready to ship.
