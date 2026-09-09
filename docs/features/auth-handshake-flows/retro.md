---
stage: operate
run: feature:auth-handshake-flows
date: 2026-09-03
assumptions:
  - "Outcome window: the run's last code merge was 2026-08-31T05:46Z and this retro was written 2026-09-03T03:20-03:40Z, so roughly 46 hours of production exposure. Release state was re-derived from the eleven commits and from GitHub rather than trusted from release.md — the reconciliation lesson from maintenance:visual-tolerance-threshold, applied here as a matter of routine."
  - "Operator population is taken as one (the project owner), per idea.md's own who-has-it answer. Every Sentry issue in the window reports Users: 0, so no statement below treats an absence of production errors as evidence that a fix works."
surfaced:
  - "Still open, still a human step: Auth0 Allowed Logout URLs on tenant dev-ytbgmz5ls3wh4xdx.us.auth0.com must contain https://mattbutlerengineering.com/hospitality/callback and http://localhost:3002/hospitality/callback. That half is genuinely not readable from outside the tenant. The other half of the same surfaced line was checkable all along — see Outcomes § The unknown that was one curl away."
  - "Not verified here: a real production sign-out round-trip. Reaching signoutRedirect requires authenticating as the operator, which this retro did not do. The signed-out state was confirmed by direct navigation (ux.md's S4 bookmark case), which exercises the same gate but not the Auth0 return leg."
  - "Not verified here: review.md m1's sub-second flash. It is confirmed still present in the code (App.tsx isLoading branch), but no attempt was made to catch it rendering in a browser."
---

# Retro: Auth handshake flows

## Outcomes vs. intent

### idea.md's one sentence: every auth transition shows a deliberate, design-system-native state — no blank screen, no dead end, no unexplained wait

- What happened: **achieved for state, and the deployed surfaces prove it.**
  Measured live on production at 2026-09-03T03:23Z, unauthenticated, in a
  real browser:

  ```
  https://mattbutlerengineering.com/hospitality/callback
    title    "Hospitality - Matt Butler Engineering"
    heading  "Hospitality"
    para     "You're signed out. Sign in again whenever you're ready."
    button   "Sign In"
    console  0 errors, 0 warnings
  ```

  That is the exact URL that used to render "Verifying your sign-in /
  Exchanging your code for a session" indefinitely. PRD criterion 1 holds
  where users get it. The "Sign In" accessible name — the frozen E2E
  contract from criterion 9 — is intact on the deployed bundle, not just in
  the test suite.

  ```
  https://mattbutlerengineering.com/rialto/demos/login
    img      "Sign-in exchange at rest"  (stations: Browser, Identity)
    status   (live region, empty at rest)
  ```

  The demos half is live too: `Handshake` is the instrument on the sign-in
  demo, replacing the busy-button-only pattern.

- Signal strength: **measured** for the deployed state; the probe is a real
  browser render, not a status code — necessary here, because rialto-web's
  `not_found_handling = "single-page-application"` returns 200 for any path
  under `/rialto/` (release.md already recorded being caught by this).

### PRD success criteria 1–12: verification said 12/12; what does production say 46 hours on?

- What happened: nothing has contradicted them. All eleven in-run commits
  are still ancestors of `origin/main`, none reverted, and criterion 8's
  acceptance grep still returns zero (`AuthFlowPage.module.css` contains no
  `pulse`/`groove` rules). The run's code is intact as shipped.
- Signal strength: **measured** (git), but see the next two sections — "not
  contradicted" is a weaker claim than it sounds when the population is one.

### The dead ends this run existed to remove: how often did they actually fire?

The PRD surfaced this as its central unmeasured quantity — "n = 0 user
reports", "the case rests on code reading alone" — and explicitly deferred
measuring it to Operate. So: measured now, 14-day window covering the
release. The hospitality Sentry project holds six issues:

| Issue         | What                                                | First seen  |
| ------------- | --------------------------------------------------- | ----------- |
| HOSPITALITY-7 | `GET /api/v1/users/me` 401, from `/profile`         | 2 days ago  |
| HOSPITALITY-5 | `GET /api/v1/tables` 403 admin role, `/waitlist`    | 3 days ago  |
| HOSPITALITY-4 | `GET /api/v1/tables` 403 admin role, `/timeline`    | 3 days ago  |
| HOSPITALITY-6 | `GET /api/v1/reservations` 403, `/guests`           | 3 days ago  |
| HOSPITALITY-3 | CSS preload failure, `HomePage-CjqQZ4gG.css`        | 10 days ago |
| HOSPITALITY-2 | `POST /api/v1/venues` 403 admin role, `/onboarding` | 12 days ago |

**Not one is an auth transition.** No callback failure, no sign-out dead
end, no refresh failure, no error from any surface this run built. The four
403s and the 401 are authorization and data-access, downstream of a session
that already exists; HOSPITALITY-7 is the known-expected token-expiry race.

Two readings, and the honest answer needs both:

- **The channel is live, so the absence is real.** HOSPITALITY-3 is a
  genuine browser-side error and the API failures are frontend-captured, so
  hospitality's Sentry is demonstrably reporting from the browser. This is
  not the `maintenance:backend-observability-blackout` shape where silence
  meant a missing DSN.
- **The population is one, so the absence proves little.** Every issue
  reports `Users: 0`, and idea.md's own answer is that the operator today is
  the project owner. Zero handshake errors out of a sample of one operator
  is not evidence the fix works; it is mostly the absence of people.

What the 403s _do_ prove, incidentally, is the thing hardest to get from a
public probe: **somebody signed in successfully after the release.** Those
errors fire from `/profile`, `/waitlist`, `/timeline`, `/guests` — pages
only an authenticated session reaches — on 2026-08-31 and 2026-09-01. The
sign-in path works end to end in production, post-run.

- Signal strength: **measured** for "no auth-transition errors occurred";
  **anecdote** for "the fixes work", and it stays an anecdote until someone
  other than the author signs in.

### The unknown that was one curl away

Every stage of this run carried the same surfaced line forward: the Auth0
Maintainer step, described as two things that could not be verified from the
repo — the Allowed Logout URLs, **and** whether the discovery document
exposes `end_session_endpoint`. `idea.md`, `prd.md`, `review.md` and
`release.md` each restate it.

The second half was public the whole time:

```
$ curl -sS https://dev-ytbgmz5ls3wh4xdx.us.auth0.com/.well-known/openid-configuration
end_session_endpoint: https://dev-ytbgmz5ls3wh4xdx.us.auth0.com/oidc/logout
issuer:               https://dev-ytbgmz5ls3wh4xdx.us.auth0.com/
```

One unauthenticated request, no credentials, no tenant access. The
Allowed-Logout-URLs half genuinely does require the tenant — but bundling
the two under one surfaced line made the checkable half inherit the
uncheckable half's status, and then quotation carried it through four
artifacts without anyone re-testing it.

This has a concrete consequence beyond tidiness: review.md deferred minor m2
(a failed sign-out renders sign-in-worded copy) partly on the reasoning
"pair it with the outstanding tenant-verification Maintainer step, which is
the same path's likeliest trigger" — and the named trigger was a missing
`end_session_endpoint`. It is not missing. m2 remains a real finding; its
stated likelihood was resting on something now measured false.

- Signal strength: **measured**.

### The reference implementation, one day later

The PRD's stated goal for the rialto-web half was that the demos become
"the reference implementation a consumer copies". Between 21:31Z on
2026-08-31 and 01:36Z on 2026-09-01 — **four to eight hours after Ship ran
its post-release probe** — five agent-authored fixes landed on this run's
own surfaces:

| PR    | Merged (Z)  | Tier      | Fix                                                   |
| ----- | ----------- | --------- | ----------------------------------------------------- |
| #4818 | 08-31 21:31 | sensitive | uncontrolled `Checkbox` + `required` wiring           |
| #4828 | 08-31 22:12 | standard  | auth demos hand off to the dashboard on success       |
| #4831 | 08-31 22:52 | critical  | flag every required field on empty submit             |
| #4834 | 08-31 23:19 | critical  | clear and refocus the OTP input after a rejected code |
| #4852 | 09-01 01:36 | standard  | title the unauthenticated landing "Hospitality"       |

Two of these sit on rows the PRD's transition table **enumerated by name**
and the run **deliberately changed**:

- `/demos/login rejected code` → the run added `Handshake failed` to this
  row (criterion 6). #4834 found that the rejected code stayed in the boxes
  and keyboard focus was stranded on `document.body` with no way to retype
  without a pointer. The run made the failure _look_ deliberate; recovering
  from it was still broken.
- `/demos/login verified` → the run added `Handshake settled` for this beat
  (criteria 6 and 7). #4828 found the beat was the terminus: the demo
  settled, toasted, and then did nothing. A consumer copying the reference
  sign-in copied a sign-in that signs you into nothing.

And #4828 had to add `REDUCED_VERIFIED_SETTLE_MS` / `REDUCED_HANDOFF_DELAY_MS`
— reduced-motion variants of the run's **own** timed beats. Criterion 11 was
"Accessible and motion-safe" and was graded green; it was read as a question
about the instrument's travelling pulse, and the new delays the run itself
introduced were never held to it.

The pattern is not that the run was sloppy — verification.md graded 12/12
honestly against criteria that were genuinely checkable, and review.md's six
minors are all real and all still open. The pattern is that **the run's
frame was state, and it delivered state.** "Every transition shows a
deliberate state" is a claim about a rendered instant. What happens _next_ —
where focus goes, where the user lands, whether the form can be recovered —
was outside every row of the table, so twelve green criteria and a
"Ready to ship" verdict were all fully compatible with a demo you cannot
finish. An audit pass framed around accessibility and usability found four
of them in one evening.

- Signal strength: **measured** (five merged PRs, timestamps and diffs read
  directly).

### The six deferred minors

All six re-checked against `origin/main` at `5a302deed`; **all six still
open, verbatim as review.md described them.** No drift, no accidental fix:

- m1 — `App.tsx`'s `isLoading` branch is still `isCallback ? <CallbackPage /> : <LoadingPage />`;
  `hasAuthParams` is consulted only in the later `isCallback && !isAuthenticated`
  branch, so the post-logout restore beat still flashes "Exchanging your code
  for a session".
- m2 — `AuthFailurePage` copy unchanged; none of the five fixes touched it.
- m3 — the banner's `<Button variant="secondary" onClick={handleSignInAgain}>`
  still has no `isLoading`/`loadingText`; ux.md S5 still claims one.
- m4 — `SIGN_IN_PHASES` is still a module-private `const` (SignIn.tsx:52)
  with no distinctness table test, **even though #4828 and #4834 rewrote that
  file substantially in the days since.** Two passes over the file, and the
  known-missing regression pin was not added by either.
- m5 — `STATIONS`'s doc comment still says "in display order (start → end)"
  while display order comes from `HANDSHAKE_STATIONS` (`["Identity","Browser","API"]`)
  and a **third** hand-maintained ordering, `LEGEND_STATIONS`
  (`["idp","browser","api"]`, AuthFlowPage.tsx:37), drives the legend. Three
  parallel orderings, none pinned to another.
- m6 — AuthFlowPage.tsx:109 still hard-codes
  `aria-label="Authorization-code exchange between Identity, Browser, and API"`,
  state-invariant, awaiting the UX ruling that has not happened.

- Signal strength: **measured**.

## Run retrospective

- **Keep: the PRD's per-transition table.** Twelve rows of
  "today → required after this run", each with a named check. It made Verify
  mechanical and made the one genuine spec defect findable. Every criterion
  was graded and the grading was honest — that is the run's strongest
  artifact and it should be the default shape for any UI-state feature.
- **Keep: grading against the higher-order rule, not the item's literal
  acceptance line.** Criterion 11's FAIL (the signup `settled` label and
  status being the same sentence) existed because ux.md D2 specified it that
  way and issue #4729 copied the spec faithfully — the worker complied with
  its acceptance criterion exactly. Verify caught it only because it graded
  against the PRD's accessibility rule instead. That is the single most
  valuable behaviour this run demonstrated.
- **Keep: routing that FAIL back through Implement as a first-class issue**
  (#4770 → PR #4772, RED test first) rather than patching it inside Verify,
  and amending ux.md with a dated line so the spec and the code re-converged.
- **Keep: freezing the E2E contract as an explicit criterion** with a
  `git diff --stat` check on the two spec files. It held through eleven PRs,
  and the "Sign In" accessible name is confirmed intact on the deployed
  bundle today.
- **Change: grade interaction, not only state.** Every row of a transition
  table needs a second column — _and then what?_ Where focus lands, where
  the user goes, whether the input can be retried. Four of the five
  follow-up fixes live in that missing column, two on rows the table named.
- **Change: re-test surfaced unknowns at each stage instead of copying them
  forward.** A `SURFACED:` line propagates by quotation and nothing
  re-examines it. `end_session_endpoint` was one unauthenticated curl away
  through four artifacts. At minimum, a stage that restates an unknown
  should record _what it tried_, not just what the previous stage wrote.
- **Change: hold the run's own additions to the run's own accessibility
  criteria.** Criterion 11 was applied to the component's animation and not
  to the timed beats the run introduced, so a motion criterion graded green
  over motion that ignored the preference.
- **Stop: bundling a checkable unknown with an uncheckable one under a
  single surfaced line.** That is the specific mechanism that made a public
  fact unverifiable for the life of the run — and it silently propped up a
  review finding's deferral rationale.

## Idea seeds

Appended to `docs/backlog.md`; listed here as the retro's own output.

- Fix m1's post-logout flash (`hasAuthParams` in the `isLoading` branch).
- Branch `AuthFailurePage`'s copy on the navigator source so a failed
  sign-**out** stops being reported as a failed sign-in (m2) — noting its
  stated trigger is now measured false.
- Resolve m3 one way or the other: give the banner button its in-flight
  state, or amend ux.md S5 as D2 was amended.
- Export and pin `SIGN_IN_PHASES` for label≠status distinctness (m4).
- Clean up the walkthrough: collapse the three parallel station orderings
  and give the Handshake a phase-aware label (m5 + m6).
- Add the "and then what?" column to transition tables — the process seed.
- Re-test surfaced unknowns per stage rather than quoting them forward.
- The Auth0 Allowed Logout URLs human step, still genuinely open.

## Run complete

Closed 2026-09-03. Eleven code PRs plus the docs landing (#4787) on `main`
and deployed; the signed-out landing and the sign-in demo both confirmed on
production in a real browser; zero auth-transition errors in a live Sentry
channel over a 46-hour window with a population of one. Six review minors
carried forward unfixed and five follow-up fixes already landed on the
run's surfaces — the seeds above are the input to the next Idea-stage run.
