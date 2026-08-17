---
stage: review
run: maintenance:rialto-web-fonts
date: 2026-08-17
---

# Review: rialto-web zero-web-fonts fix

## Scope

The three commits on `fix/rialto-web-fonts` vs `origin/main`:

```
 apps/rialto-web/index.html                          |  20 +-
 docs/backlog.md                                     |   2 +-
 docs/fixes/rialto-web-fonts/defect.md               | 179 +++
 docs/fixes/rialto-web-fonts/verification.md         | 239 +++
 scripts/__tests__/app-html-inline-handlers.test.mjs |  80 +++
```

Two files carry behaviour: the HTML entry point (the fix) and the new guard
(the thing that stops it recurring). The guard got the harder look — it is new
logic that will block CI for everyone, and a guard that is wrong is worse than
no guard, because it is trusted.

## Findings

### Major: the guard silently missed handlers following a `>` inside an attribute value

- Scenario: `<div title="a>b" onclick="boom()"></div>`. The tag pattern
  `<[a-zA-Z][^>]*>` terminates the tag at the `>` inside `title`, so the scan
  never reaches `onclick`. Probed against the as-written detector:

  ```
  E. > inside attr value, then onclick   []      ← real handler MISSED
  ```

  An app could ship the exact defect this run exists to prevent while the guard
  reported green. That is the dangerous direction and the same shape as two
  known traps in this repo — the stale `agent-core/dist` that returns confident
  wrong answers, and a workflow glob that silently scopes itself to nothing. A
  false "safe" is indistinguishable from genuinely safe.

- Decision: **fixed**. `openingTags()` now matches tags with quoted attribute
  values respected, and a regression test pins the exact case.

  ```
  E. > in attr value then onclick        ["onclick"]
  ```

### Minor: the guard flagged any attribute whose name merely begins with `on`

- Scenario: `<my-el once="true">` or `<my-el only="a">` — neither is an event
  handler, both were reported as one:

  ```
  C. once= attribute    ["once"]
  D. only= attribute    ["only"]
  ```

  Cost is a wrongly-red CI on a PR that did nothing wrong. Lower severity than
  the above because it fails loud: someone sees a clear message and a concrete
  attribute name, rather than shipping a live defect.

- Decision: **fixed** in the same edit, but deliberately _not_ by narrowing the
  name test to a list of known event handlers. An allowlist of handlers fails
  **silent** when it misses one, which reintroduces the major above. The name
  test still flags any unknown `on*`; only known non-handlers are excused, via
  an explicit `NON_HANDLER_ON_ATTRIBUTES` set that is additive. Fail loud by
  default, allowlist explicitly — the same posture as `classifyBuildFreshness`
  failing closed on `unknown`.

### Minor: nothing guards the duplication the fix just created

- Scenario: the font block is now byte-identical in `apps/marketing/index.html`
  and `apps/rialto-web/index.html` — about twenty lines, twice. Marketing later
  adds a font weight to its `href`; rialto-web is not updated; the guard stays
  green because neither file has an inline handler; the two apps silently
  diverge in typography. That is a weaker version of the exact class that caused
  this defect — a pattern maintained in one place and not the other.
- Decision: **deferred**. Vite HTML entry points have no include mechanism, so
  removing the duplication means introducing a build step or a generator, which
  is a design change well outside a scoped fix. A cross-file byte-equality test
  was considered and rejected: the two apps legitimately may not always want
  identical font sets, so the test would encode a constraint the codebase does
  not actually hold and would fire as a false alarm the first time they
  diverge on purpose. Seeded to `docs/backlog.md` instead rather than
  silently dropped.

## Passes with no findings

- **Security.** The CSP itself is untouched — `git diff origin/main...HEAD --
infrastructure/` is zero lines. No `'unsafe-inline'` or `'unsafe-eval'` is
  introduced anywhere (the only occurrences in the diff are prose explaining
  that `script-src` correctly omits it). No secrets. The change adds **no new
  external origin**: the Google Fonts URL is unchanged and was already present.
  `style-src` already allows `fonts.googleapis.com` and `font-src` already
  allows `fonts.gstatic.com`, so the policy was always ready for these fonts and
  only the promotion mechanism was broken — which is further evidence this was
  an oversight in one app, not a deliberate policy decision. The fix relies on
  the existing nonce mechanism exactly as designed rather than carving an
  exception for itself.
- **Correctness of the HTML fix.** The `load`-listener race was examined
  specifically: the promotion script is synchronous and immediately follows the
  preload link, and resource load events are dispatched as queued tasks that
  cannot preempt a running parser-blocking script, so the listener is always
  attached before the event can fire. Behaviour is confirmed empirically under
  the real CSP in `verification.md` (23 faces, `rel="stylesheet"`, zero
  violations), and identically in production on `marketing`, which has run this
  pattern since 2026-07-04.
- **Design.** The fix is a verbatim port of an in-repo pattern rather than a new
  invention, which is the correct call for a defect whose root cause was an
  incomplete rollout. The guard's home in `scripts/__tests__/` matches the
  existing convention for tests asserting properties of real repo files
  (`pulumi-cli-pin.test.mjs`, `ci-gate-commit-status.test.mjs`).

## Verdict

**Ready to ship**, with one expected red.

Both fixed findings were in the guard, not the fix — the HTML change was clean
on all three passes. After the fixes: `9 passed` in the guard's own file, `2173
passed` across the full `scripts/` suite (up from 2169 by the four new detector
tests).

Ship must plan for `apps/rialto-web/e2e/visual.spec.ts` going red: all 48
committed baselines were captured against a fontless page, and
`rialto-web-e2e.yml` runs on this PR's paths. This is expected, not a
regression — see `verification.md` § Not verified for the required recovery
(regenerate from the Linux CI artifact, never locally on macOS). Merging with
that red unaddressed would start a cascading red streak on `main`.
