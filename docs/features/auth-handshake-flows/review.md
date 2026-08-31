---
stage: review
run: feature:auth-handshake-flows
date: 2026-08-31
assumptions:
  - "Severity arbitration defaulted: the skill's draft-first step lets the user arbitrate severity live; the autorun brief is silent, so the reviewer's own ranking stands. No critical or major findings were drafted, and minors may be deferred freely per the skill, so no arbitration decision was actually forced."
  - "Main-side truth read at origin/main `dc42d4fb4` (the local checkout sat 3 commits behind at review start, per the stale-checkout gotcha); the run's own head is `14af05e3c` and the delta between the two is entirely out-of-run (#4775 PinInput fix, two automation commits) — every file quoted below is byte-identical at both refs except `PinInput.tsx`, which no run PR touched."
  - "Scope taken as the eleven squash merges (ten breakdown items + verify-fix #4772), reviewed per-PR and as final file state; out-of-run commits inside the same window (#4732 WatchLoader, #4735 api-client/e2e-mocks, automation metrics) are excluded from findings but checked for interference with the run's acceptance greps (see Scope)."
surfaced:
  - "Carried forward, unresolved by any stage (not a new question): the Auth0 tenant Maintainer step — Allowed Logout URLs for https://mattbutlerengineering.com/hospitality/callback and http://localhost:3002/hospitality/callback, and `end_session_endpoint` in the discovery document — remains unverified from the repo. Until done, the signed-out gate is unreachable via a real sign-out in production (Auth0 stops on its own error page), and finding m2's sign-out-failure path is the likelier first experience. Ship must restate it as a pre/post-flight human step."
---

# Review: Auth handshake flows

## Scope

The diff since the run began: eleven squash merges to `main`, base `1d6189203`
(PR #4720), head `14af05e3c`.

| Commit      | PR    | Item                                                       |
| ----------- | ----- | ---------------------------------------------------------- |
| `e06b2951d` | #4736 | `deriveReturnTo` callback rule + `hasAuthParams` re-export |
| `fb67f7b11` | #4737 | `LoginGate signedOut` prop                                 |
| `9e1ff69e0` | #4733 | `AuthFailurePage`                                          |
| `f8dca42a2` | #4748 | `SignOutPage`                                              |
| `3986a98e4` | #4755 | `SESSION_LAPSE_COPY` + gate/banner one voice               |
| `500affc76` | #4765 | `App.tsx` gate order + CLAUDE.md paragraph                 |
| `ad18c502d` | #4747 | `/demos/auth-flow` → `handshakeFor` projection             |
| `e97d1db03` | #4734 | `/demos/login` phase table                                 |
| `8d0579abe` | #4750 | `/demos/signup` phase table                                |
| `5c102dfc3` | #4749 | `/demos/session-expired` lapse state                       |
| `14af05e3c` | #4772 | Verify-fix: signup `created` label ≠ status                |

Files examined in final main-side state: `packages/auth/src/react/{return-to,index,hooks}.ts`,
`provider.tsx`; hospitality `App.tsx`, `AuthFailurePage.{tsx,module.css}`,
`SignOutPage.{tsx,module.css}`, `LoginGate.tsx`, `SessionExpiredGate.tsx`,
`DashboardLayout.tsx` (banner region), `session-lapse-copy.ts`,
`lib/describe-auth-error.ts`, `apps/hospitality/CLAUDE.md`; rialto-web
`authFlowMachine.ts`, `AuthFlowPage.tsx`, `SignIn.tsx`, `SignUp.tsx`,
`SessionExpired.tsx`, `AuthLayout.module.css`; plus
`packages/rialto/src/components/Handshake/Handshake.tsx` (unchanged
dependency, read for lane/state semantics) and `packages/auth/CLAUDE.md`.

Window hygiene, re-measured here rather than recalled: `git log 1d6189203..14af05e3c -- packages/rialto/src`
shows only out-of-run `ce6aab04a` (#4732, which carries its own changeset —
the criterion-12 "changeset iff rialto src" rule held for the run's own PRs);
`git diff --stat` over the window is empty for `apps/hospitality/e2e/auth.spec.ts`

- `auth.setup.ts` (the frozen contract files) and for `apps/rialto-web/e2e`
  (zero visual-baseline churn). The one `apps/hospitality/e2e` delta in the
  window (`api-mocks.ts`, 2 lines) belongs to out-of-run #4735.

Predecessor `verification.md` exists (soft gate satisfied): 12/12 PRD criteria
PASS after the criterion-11 re-verification.

## Findings

Three passes (correctness, design, security). No critical, no major; six
minors, all deferred with reasons. Every scenario below was re-read against
the code before being written down.

### Minor (m1): post-logout restore beat still flashes "Exchanging your code for a session"

- Scenario: sign-out returns to `/hospitality/callback` with no OIDC params.
  On the fresh mount, react-oidc-context holds `isLoading` true for the
  stored-user restore beat (`activeNavigator` undefined), and `App.tsx:75-87`
  renders `CallbackPage` for any `/callback` pathname inside the `isLoading`
  branch without consulting `hasAuthParams` — so the operator sees
  "Verifying your sign-in / Exchanging your code for a session" for a beat in
  which no exchange exists, before the signed-out gate replaces it. Within
  PRD criterion 1's letter (it conditions on "auth not loading") and no timer
  or dead end is involved, but the words lie for that beat, which is the
  exact sin the run exists to remove. One-line shape of a fix:
  `hasAuthParams(window.location) ? <CallbackPage /> : <LoadingPage />` in
  the `isLoading` branch.
- Decision: deferred — sub-second, spec-compliant, and touching the gate
  order post-run deserves its own tested change. Backlog-seed candidate at
  Operate.

### Minor (m2): a failed sign-out redirect renders a sign-in-worded failure screen

- Scenario: `signOut()` → `signoutRedirect` throws _before_ the browser
  leaves (network drop; or the tenant's discovery document lacks
  `end_session_endpoint` — a precondition every stage surfaced as
  unverifiable from the repo). react-oidc-context dispatches an interactive
  error, `App.tsx:89-95` routes it to `AuthFailurePage`, whose copy is
  sign-in-specific on every path: img label "Your sign-in could not be
  verified", `describeAuthError` default "Sign-in hit a snag / Something
  unexpected happened during sign-in", action "Try again" that starts a
  sign-**in**. The operator asked to leave and is told their sign-in failed.
  ux.md designed the routing (S7: "the interactive error lands in S3") and
  assumption 12 scopes S3 to "any interactive auth error", so the structure
  is per spec; the decayed contract is the copy, which never contemplated a
  sign-out origin. Recoverable (no dead end; retry re-authenticates,
  navigating away shows `LoginGate`).
- Decision: deferred — rare path, no trap, and the right fix (branch the
  status/label copy on the error's navigator source) wants a small design
  decision. Pair it with the outstanding tenant-verification Maintainer step,
  which is the same path's likeliest trigger.

### Minor (m3): banner action has no in-flight state; ux.md S5 still claims one

- Scenario: `refreshError` banner shown, operator clicks "Sign back in"
  (`DashboardLayout.tsx:332-334` — no `isLoading`/`loadingText` on the
  button). For the beat before the browser leaves for Auth0 nothing changes
  on screen — the one remaining feedback-less sign-in-bound click, on a run
  whose theme is that no click feels dead. This was a _decided_ deviation
  (architecture assumption 17, decompose assumption 3: copy-only change),
  and PRD criterion 5 is satisfied as written — but ux.md's Shared copy
  table still assigns `LAPSE_ACTION_BUSY` to S5 and its S5 sketch draws the
  busy beat, so the design artifact and the code now disagree, exactly the
  divergence class the D2 row got a dated amendment for.
- Decision: deferred — either give the banner button
  `isLoading={activeNavigator === "signinRedirect"}` +
  `loadingText={SESSION_LAPSE_COPY.actionBusy}` in a follow-up, or amend
  ux.md S5 the way D2 was amended. Recording the inconsistency here is the
  review's job; picking a side is UX's.

### Minor (m4): criterion-11 distinctness is regression-pinned only on SignUp

- Scenario: verify-fix #4772 added the `describe.each` table test asserting
  `ariaLabel !== status` over the exported `SIGN_UP_PHASES` — but
  `SIGN_IN_PHASES` (`SignIn.tsx:37-62`, four label/status pairs, all
  currently distinct) is neither exported nor pinned. A future copy edit
  that collapses a SignIn pair to one sentence reproduces the exact
  criterion-11 defect Verify caught on SignUp, and the suite stays green —
  the same "spec defect invisible to its own tests" arc, one file over.
  (`AuthFailurePage.test.tsx` and `SignOutPage.test.tsx` already carry
  `not.toBe` assertions; only SignIn lacks the guard.)
- Decision: deferred — cheap, mechanical follow-up mirroring #4772's
  pattern; no current defect exists.

### Minor (m5): authFlowMachine doc-rot and twin hand-maintained orderings

- Scenario: `authFlowMachine.ts:13-14`'s `STATIONS` doc comment still says
  "in display order (start → end)" although display order is now the hub
  order carried by `HANDSHAKE_STATIONS` (`:22`) and `LEGEND_STATIONS`
  (`AuthFlowPage.tsx:37`) — and those two are parallel, hand-maintained
  orderings with no test pinning legend order to instrument order. Reorder
  one without the other and the legend cards silently disagree with the
  instrument beneath them; nothing fails.
- Decision: deferred — both halves were logged as out-of-scope nits in the
  #4747 review at implement time; carrying them here keeps them visible for
  a cleanup pass. No behavior is wrong today.

### Minor (m6): the walkthrough's Handshake label is a placeholder and state-invariant

- Scenario: `AuthFlowPage.tsx:109` hard-codes
  "Authorization-code exchange between Identity, Browser, and API" — a
  string decompose invented (breakdown § Design gaps: D4's label was
  specified nowhere) with an explicit request for UX override that hasn't
  happened. It also never varies: on the REJECTED step the img still
  describes a healthy exchange while `data-state="failed"` (the aria-live
  caption carries the failure, so a screen-reader user is not stranded —
  but the image's own name contradicts its state). Meets the letter of
  #4726's acceptance (non-empty, ≠ caption).
- Decision: deferred — already tracked in breakdown § Design gaps; resolve
  when UX rules on the label, ideally making it phase-aware like every
  other surface in this run.

## Passes with no findings

- **Security — clean.** The `returnTo` open-redirect discipline holds on
  both sides: `deriveReturnTo` gates through `isSafeReturnTo` (rejects
  absolute, `//`, `/\` forms) and the read side re-validates in
  `CallbackRedirect` before navigating; the new callback-path rule returns a
  constant `"/"` and adds no injectable surface. `hasAuthParams` is a pure
  re-export of the provider's own predicate — gate and provider cannot
  disagree. `error.message` under "Technical details" renders as
  React-escaped text (no HTML injection), discloses nothing beyond what the
  IdP already put in the operator's own URL, and stays collapsed. No
  secrets, no new storage, no new network calls anywhere in the diff; the
  demo forms submit nothing.
- **Design conformance — clean beyond m3/m5/m6.** `App.tsx` matches
  architecture.md's gate-order pseudocode branch for branch, and
  `apps/hospitality/CLAUDE.md:9` describes it accurately; `deriveReturnTo`
  implements the interface contract exactly (exact-pathname match, search/
  hash ignored, unparseable `redirectUri` never matches);
  `SESSION_LAPSE_COPY` is byte-identical to ux.md's shared-copy table and is
  the single source for both consumers; `AuthFailurePage`/`SignOutPage`
  compose or mirror the sibling gates' CSS as decomposed (tokens only,
  logical properties, no new motion); `handshakeFor` matches its contract
  for all eight steps including the deliberate TOKENS-as-negotiating
  override; `Handshake` lane/station usage is in-range everywhere
  (2-station lane 0, 3-station lane 0/1 — the component clamps regardless);
  `packages/rialto/src` untouched by run PRs, `packages/auth/CLAUDE.md`
  gained the row and lifecycle sentence, and the llms artifacts regenerated
  clean (`pnpm regen --check` green in Verify).
- **Correctness beyond m1/m2** — the routed states hold up under the edge
  cases the tests miss: retry-in-flight keeps the failure page mounted in
  its negotiating variant (react-oidc-context leaves `error` in place);
  a reload of the failure URL re-fails on the consumed code and lands on
  the same stable screen, not a loop; a bookmark visit to `/callback`
  gets an honest signed-out gate (ux.md S4 anticipated it); the demo phase
  machines derive at render time with no `setState`-in-`useEffect`;
  `useAuth()`'s return shape is unchanged so `apps/gen`'s mock stands.
  Pre-existing, flagged-not-fixed per the surgical rule: `isCallback` uses
  `pathname.endsWith("/callback")` (broader than `deriveReturnTo`'s exact
  match) — no product route makes the divergence reachable today; and the
  rialto `PinInput` defects found while verifying are tracked out-of-run
  (#4771 fixed/merged as #4775; #4782 open).

## Quality-story note: the criterion-11 arc

The one Verify FAIL was a **spec** defect (ux.md D2 assigned the img label
and status line the same sentence; issue #4729 copied it; the worker complied)
caught by grading against the PRD's higher-order rule instead of the item's
literal acceptance line. It routed back through Implement as a first-class
issue (#4770 → PR #4772, RED test quoted, review-gate 10/10), the fix pinned
the rule as a table test over the real exported data, ux.md line 523 got a
dated amendment, and the surface was re-verified from the merged tree. That
is the pipeline working as designed — the residue is m4: the regression pin
should cover the sibling table too.

## Verdict

**Ready to ship.** 0 critical, 0 major, 6 minor — all deferred with logged
reasons; nothing blocks release. Two riders for Ship: (1) the Auth0
Allowed-Logout-URLs / `end_session_endpoint` Maintainer step is still open
and gates whether a real sign-out ever reaches the signed-out state in
production (in-repo behavior is deliberate either way, and m2 describes the
failure face if the tenant is short); (2) deploy-static for `14af05e3c`
should be confirmed and the `/demos/signup` label re-probed post-deploy, as
verification.md already notes. Next stage: Ship.
