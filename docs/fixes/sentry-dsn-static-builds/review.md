---
stage: review
run: maintenance:sentry-dsn-static-builds
date: 2026-08-17
---

# Review: Sentry build env for the marketing and rialto-web deploys

## Scope

The diff this run produced, against `origin/main`:

- `.github/workflows/deploy-static.yml` — +21 lines, additive only
- `scripts/__tests__/deploy-static-sentry-env.test.mjs` — new guard
- `docs/fixes/sentry-dsn-static-builds/*` — run artifacts
- `docs/backlog.md` — one seed claimed

Scaled as a maintenance run per the protocol: a scoped, additive fix gets a
lighter pass than a refactor, and Verify's regression evidence is the floor —
not re-litigated here.

## Findings

### 1. MAJOR — the guard could false-pass on a comment naming the variable

**Found and fixed during this review.**

The first version of the guard asked `step.includes(\`${key}:\`)`. That is a
substring test over the whole step block, comments included. The steps this
change adds deliberately carry comments naming the very variables being
asserted, so a step that *mentions* `VITE_SENTRY_DSN:` in a comment while not
assigning it would have passed.

Failure scenario, concrete: someone adds a fourth static app, wires the build
step, and leaves `# TODO wire VITE_SENTRY_DSN: pending secret provisioning`
in the env block. The app ships with Sentry inert; the guard reports green.
That is precisely the defect class this run exists to prevent, so a guard that
can report green on it is worse than no guard — it converts an open question
into a false assurance.

Demonstrated rather than asserted:

```
old substring check says present: true   <- would FALSE-PASS
hardened check says present:      false  <- correctly absent
```

Fixed by `assignsEnv()`: comment lines are dropped, and a key counts only when
it starts its own line and is followed by a colon and a value. The key is
compared by exact equality rather than interpolated into a regex — the same
choice `pulumi-cli-pin.test.mjs` documents, avoiding the hand-escaping that
CodeQL flags as `js/incomplete-sanitization`.

Re-verified after the change, both directions:

- current workflow → `Tests 4 passed (4)`
- pre-fix workflow (`git show 907ad4543~1:...`) → still discriminates:

  ```
  marketing    absent=[VITE_SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN]
  hospitality  absent=[]
  rialto-web   absent=[VITE_SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN]
  ```

  Hardening did not cost the guard its discrimination, which was the risk.

### 2. MINOR — textual YAML parsing could mis-bound a step block

`stepBlocks()` splits on `^\s*-\s+(name|run|uses):` rather than parsing YAML.
A nested sequence whose items carried those keys (inside a `with:`, say) would
start a spurious block and could truncate a real step, making a present
variable look absent.

Not a live defect, and cross-checked rather than assumed: parsing the same file
with a real YAML parser yields exactly the env-key sets the textual guard
asserts, for all three build steps. The precedent (`pulumi-cli-pin.test.mjs`,
`ci-node-matrix.test.mjs`) is deliberate — nothing in `scripts/` depends on a
YAML parser, and adding one for a single test is not worth the dependency.

**Deferred**, with reason: the failure direction is safe. A mis-bounded block
makes a variable look _absent_, so the guard fails loudly and gets looked at.
It cannot produce a silent false green, which is the only outcome that matters
here.

### 3. MINOR — `STATIC_APPS` is hand-maintained

An app added to `deploy-static.yml` but not to `STATIC_APPS` is not checked.

**Deferred**, deliberately, and documented in the test: the alternative is a
glob, which fails silently in exactly the direction that hides a missing app —
an app with no build step is also an app the glob never yields. A hand-edited
constant fails loudly when an app is renamed (the enumeration test asserts
every listed app has a build step) and is a visible line in review when one is
added. Noted in `verification.md` § Not verified.

## Design

Matches the codebase's existing patterns:

- Workflow-assertion tests read the real file and parse it textually —
  consistent with `pulumi-cli-pin.test.mjs` and `ci-node-matrix.test.mjs`.
- The change is confined to the two build steps plus one new test file. No app
  code, no shared package, no adjacent cleanup.
- Comments explain _why_ the four variables travel together, which is the
  non-obvious part and the reason a partial fix would look complete.

No ADR is implicated. No architectural contract changed.

## Security

- **No secrets in the diff.** The workflow references `${{ secrets.* }}`
  indirections only; no literal token, DSN, or key appears. All four secrets
  already existed in the repo — none were created or modified by this run.
- **No new secret exposure surface.** The three `SENTRY_*` variables are build-
  time only and are not inlined into the bundle; only `VITE_SENTRY_DSN` reaches
  client code, which is its designed use (a Sentry DSN is a public ingest
  identifier, and hospitality has shipped one since 2026-05-18).
- **Source maps re-checked.** Enabling `sentryVitePlugin` activates
  `filesToDeleteAfterUpload`, so maps are uploaded to Sentry and deleted from
  `dist/` — the fix moves this _toward_ the safer state. Independently, `.map`
  URLs already return `404` on all three sites (Capture § Ruled out).
- **Permissions unchanged.** No job gained a permission; the workflow's
  `permissions: contents: read` is untouched.

## Fix / defer decisions

| #   | Severity | Decision                                                                          |
| --- | -------- | --------------------------------------------------------------------------------- |
| 1   | MAJOR    | **Fixed in this run**, with before/after evidence above                           |
| 2   | MINOR    | Deferred — fails in the loud direction; cross-validated against a real YAML parse |
| 3   | MINOR    | Deferred — the alternative fails silently; trade-off documented in the test       |

No critical findings. Nothing blocks Ship.

## Note on reviewing my own diff

This was reviewed inline rather than by dispatching reviewer subagents, per the
standing session lesson that reviewer dispatches die on host sleep and
fail-open — a silently-empty review reads identically to a clean one. Finding 1
is the argument for the pass having been real: it was a genuine defect in the
guard, in the direction that would have made this run's central artifact
worthless, and it was caught and fixed before merge.
