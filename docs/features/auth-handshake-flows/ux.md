---
stage: ux-design
run: feature:auth-handshake-flows
date: 2026-08-30
assumptions:
  - "Sketches are unconfirmed: no live interview was possible, so every screen is grounded in the existing gates (`LoginGate`, `CallbackPage`, `SessionExpiredGate`), the rialto-web `AuthLayout` demos, the `Handshake` showcase page, and `packages/rialto/CLAUDE.md` rather than user taste."
  - "Q1 (`/demos/auth-flow`): per the orchestrator ruling this artifact gives the consumer-facing view only and describes the user-visible outcome of both readings (a) and (b); it picks neither — Architect decides."
  - "Q3 (`settled` on hospitality's successful callback): per the ruling no delay is added to a successful sign-in; hospitality renders `settled` only if Architect finds a zero-latency interval before navigation, otherwise the rialto-web sign-in demo is the product surface for `settled`."
  - "Q4 (signed-out form): per the ruling the state is designed, not the URL; the recommendation is `LoginGate` with a signed-out note in the tagline slot, which keeps the `login-prompt` / \"Sign In\" contract by construction."
  - "Q5 (shared lapse copy): UX owns the strings; the Shared copy section is the single source and both the banner and `SessionExpiredGate` reference it — final unless a human overrides."
  - "Sign-out in flight (S7) is designed although the PRD transition table has no row for it: user story 4 names every wait during sign-in and sign-out, and today that beat is the generic `LoadingPage`; Architect may scope it into the signed-out work item or defer it."
  - "The failure screen (S3) is designed for any interactive auth error, with the failed lane set by where the failure happened (lane 0 off `/callback`, lane 1 on it); PRD criterion 3 only requires the `/callback` case, so Architect may keep the text page for the redirect-failure case."
  - "rialto-web demo Handshakes are always present in the card (idle at rest) instead of swapping in only while in flight as hospitality's `LoginGate` does — chosen for zero layout shift and so a consumer sees the whole idle → negotiating → settled/failed lifecycle in one slot; the brief is silent."
  - "The sign-up demo goes `settled` on success (with its toast) — one step beyond criterion 7's negotiating-only minimum, because an instrument that lights up for the exchange and then goes dark while a success toast fires contradicts itself."
  - "Retry on the failure screen is labelled \"Try again\" (sentence case, matching every other non-contract button) instead of today's \"Try Again\"; the E2E-contracted \"Sign In\" keeps its capitalisation."
  - "The refresh-failure banner says the session couldn't *renew* rather than *refresh*, because \"refresh\" reads as \"reload the page\" to an operator; the banner keeps its code/doc name."
  - "Station names are the existing hospitality vocabulary — \"Browser\", \"Identity\", \"API\" — on every new surface including the demos; the walkthrough's \"Identity Provider\" card title is recommended to shorten to \"Identity\" with the role line beneath, under either reading."
  - "Written on #4720's branch (`feat/auth-lifecycle-handshake` at `972838439`), which is what the working tree had checked out; #4720 was still OPEN and `mergeStateStatus=BLOCKED` at write time. Every 'unchanged (#4720)' screen below is read from that branch."
surfaced:
  - "`apps/rialto-web/src/pages/auth/AuthLayout.module.css` has never defined the classes `.atmosphere`, `.grain`, `.sessionExpired`, `.sessionCopy`, `.verifyPanel`, `.verifyIntro`, `.verifiedRow`, `.stepsIndicator`, `.backButton`, `.passkeyButton`, `.strengthBlock`, `.strengthHeader`, `.strengthLabel`, `.checklist*`, `.termsRow`, `.termsText` that `AuthLayout.tsx`, `SignIn.tsx`, `SignUp.tsx`, and `SessionExpired.tsx` reference (0 matches at HEAD and at `origin/main`; no commit in the file's history ever added them). The demos' atmosphere/grain stage and their verify/session/strength blocks are unstyled today. Whether restoring those layout rules is inside criterion 8's 'layout rules may remain' scope has no default — Architect."
  - "The PRD keeps hospitality's `SessionExpiredGate` unchanged (no separate warning LED) while requiring the rialto-web session-expired demo to keep its warning `StatusLED` and 'match' the gate. D3 is designed with the LED as a lapse telltale beside the heading and the gate without one; whether hospitality should gain the same telltale for parity has no default — a human call."
  - "Sign In from the signed-out state and Try again from the failure screen must return the operator home (or to the pre-sign-in deep link), never to the signed-out or `/callback` URL itself — today's `signIn()` derives `returnTo` from the current location, which at `/callback` would bounce `CallbackRedirect` back onto itself. The UX requirement is stated in S3/S4; the mechanism is Architect's (Q6) and has no default here."
  - "Auth0 Allowed Logout URLs (inherited): if the post-logout URL is not allow-listed, Auth0 shows its own error page before ever returning — outside this design; whether today's `/hospitality/callback` is allow-listed cannot be read from the repo."
---

# UX: Auth handshake flows

Scope: the hospitality auth transitions and the rialto-web auth demos named in
the PRD's transition table. This artifact designs states, copy, and flows —
not URLs (Q2), not `returnTo` mechanics (Q6), not phase naming (Q7). Prior-art
screens from #4720 are sketched for completeness and marked **unchanged**.

One rule runs through every screen: **the `Handshake` shows *who* is talking;
a separate status line says *what about*.** The instrument is never the only
signal — a caption, a heading, or a field hint always carries the words.

## Flows

Actors: **Operator** (hospitality), **Consumer** (rialto-web demos),
**Maintainer** (no UI of their own — see Coverage check).

### Flow 1 — Sign in (Operator, happy path)

1. Operator opens the app root unauthenticated → **S1 LoginGate** (resting).
2. Presses **Sign In** → S1 in flight: the departure board gives way to a
   `Handshake` negotiating Browser ⇄ Identity; the button goes busy
   ("Heading to sign-in"). The browser leaves for Auth0.
3. Auth0's hosted login (outside this repo).
4. Auth0 returns to `/callback` with `code` + `state` → **S2 CallbackPage**
   negotiating on lane 1 (Identity ⇄ API), status "Exchanging your code for a
   session".
5. Exchange succeeds → immediate navigation to the preserved deep link or home.
   No `settled` beat is inserted (Q3 ruling); if Architect finds a natural,
   zero-latency interval before navigation, S2 may render `settled` in it.
   Dashboard.

### Flow 2 — Sign out (Operator)

1. Operator activates **Sign Out** from any of the three entry points: the
   sidebar's Account section, the command palette action, or the Settings page
   Account card. All call the same sign-out.
2. **S7 Sign-out in flight**: the dashboard is replaced by the unauthenticated
   shell with a `Handshake` negotiating Browser ⇄ Identity, status "Signing you
   out", for the beat before the browser leaves for Auth0's end-session
   endpoint. (Today this beat is the `LoadingPage` watch loader.)
3. Auth0 clears its session and returns to the post-logout URL — today
   `/hospitality/callback` with no params; the final URL is Architect's (Q2).
   *Boundary:* if that URL is not in Auth0's Allowed Logout URLs, Auth0 shows
   its own error page and never returns (Maintainer step, outside the repo).
4. App at the return URL, no OIDC params, not authenticated, not loading →
   **S4 Signed-out state**: `LoginGate` with the signed-out note, offering
   **Sign In**. Never `CallbackPage`, never a timer.
5. Presses **Sign In** → Flow 1 step 2. After sign-in the operator lands home,
   never back on the signed-out URL.

### Flow 3 — Sign-in fails (Operator)

1. Auth0 returns to `/callback` with an `error`, or the code exchange throws →
   `useAuth().error` is set → **S3 Failure in place**: the same stations as the
   wait, `Handshake` **failed** on the leg that failed, status "The exchange
   didn't go through", then `describeAuthError`'s title and body.
2. Branch by category (all four kept):
   - *Expired flow / network / default* → **Try again** is present. Activating
     it starts a fresh sign-in: the instrument flips to negotiating on lane 0
     (Browser ⇄ Identity), status "Starting a fresh sign-in", button busy
     "Heading to sign-in" → Auth0 → Flow 1 step 4. The operator never edits the
     URL.
   - *Access denied* → no retry; the body tells them to contact an
     administrator. `GlobalNav` remains, so the shell is not a trap.
3. "Technical details" stays reachable, collapsed, beneath the action.
4. If sign-in fails *before* the browser leaves (the redirect itself rejects),
   the same S3 renders on the root path with lane 0 failed.

### Flow 4 — A session lapses mid-shift (Operator)

Two entrances, one voice (see **Shared copy**).

- **4a. Silent refresh fails, token still valid** → **S5 Refresh-failure
  banner** slides in above the page content, non-blocking; the page beneath
  stays fully interactive. **Sign back in** → busy "Heading to sign-in" →
  Auth0 → `/callback` (S2) → back to the same page, query and hash included.
  **Dismiss** hides it until a *new* failure occurs.
- **4b. Token expires in place** → **S6 SessionExpiredGate** replaces the
  dashboard: `Handshake` idle (dark) Browser ⇄ Identity, "Your session ended",
  the shared body, **Sign back in** → instrument negotiating, button busy →
  Auth0 → S2 → the page they were on.

### Flow 5 — Consumer walks the sign-in demo (`/demos/login`)

1. **D1 credentials step**: `Steps` on step 1, `Handshake` idle above the form.
   Field validation (bad email) is inline and never touches the instrument —
   nothing is being exchanged.
2. Submit → D1 *submitting*: instrument negotiating Browser ⇄ Identity, status
   "Sending your credentials", inputs disabled, button busy "Signing in...".
3. `Steps` advances to Verification; instrument returns to idle. Enter the
   6-digit code.
4. Verify → D1 *verifying*: negotiating, status "Checking your code", button
   busy "Verifying...".
5. Rejected code (`000000`) → D1 *failed*: instrument **failed**, status "The
   exchange didn't go through", `PinInput` error hint "That code didn't match —
   try again". Editing the code returns the instrument to idle.
6. Accepted code → D1 *settled*: instrument **settled** for the existing
   700 ms beat with the "Verified" check, then the toast "Signed in
   successfully".
7. Side exits: "Use a different account" (ghost) → step 1 with the instrument
   idle; footer link "Session expired? See how we handle it" → **D3**, whose
   **Sign back in** routes to D1.

### Flow 6 — Consumer walks the sign-up demo (`/demos/signup`)

1. **D2**: `Handshake` idle above the form. Inline validation (email, password
   mismatch) never lights the instrument.
2. Submit → negotiating Browser ⇄ Identity, status "Creating your account",
   button busy "Creating account...".
3. Success → **settled**, status "Account created", toast "Account created
   successfully".

### Flow 7 — Consumer watches the walkthrough (`/demos/auth-flow`)

1. **D4** loads paused on step 1 (AUTHORIZE). Consumer presses **Play** (or
   **Next**) and reads each of the seven captions as the readout and instrument
   advance every 2.8 s.
2. Toggles **Simulate tampered state** → the flow jumps to the callback step
   and shows it REJECTED with the instrument failed; **Next** is inert until
   **Reset** or the toggle is turned off.
3. Switches tabs → playback pauses; returns → presses Play again.

## Shared copy

The one place these strings live. Both S5 and S6 render them; D3 reuses the
heading and action. Names are copy keys, not code identifiers — where they
live in code is Architect's; PRD criterion 5 accepts one shared source *or*
identical strings asserted by test.

| Key                   | String                                                                | Used by                         |
| --------------------- | --------------------------------------------------------------------- | ------------------------------- |
| `LAPSE_HEADING`       | Your session ended                                                    | S6 heading; D3 heading          |
| `LAPSE_BODY`          | Sign back in to pick up where you left off — this page is preserved.  | S6 body; S5 second sentence     |
| `LAPSE_BODY_DEMO`     | Sign back in to pick up where you left off.                           | D3 only (the demo preserves nothing, so it must not claim to) |
| `REFRESH_FAILED_LEAD` | Your session couldn't renew and will end soon.                        | S5 first sentence               |
| `LAPSE_ACTION`        | Sign back in                                                          | S5 button; S6 button; D3 button |
| `LAPSE_ACTION_BUSY`   | Heading to sign-in                                                    | every sign-in-bound button while in flight (S1, S3, S5, S6 — S1/S6 already use it) |

Rendered in full:

- **S5 banner:** "Your session couldn't renew and will end soon. Sign back in
  to pick up where you left off — this page is preserved." — action **Sign
  back in**.
- **S6 gate:** heading "Your session ended"; body "Sign back in to pick up
  where you left off — this page is preserved."; action **Sign back in**.
  (Identical to today's gate — only the banner changes.)

Why one voice: the two lapses differ only in tense — the gate's session *has*
ended, the banner's *will* — so they share the noun ("your session"), the
promise ("pick up where you left off — this page is preserved"), and the verb
on the button. The banner's first sentence is the only text that differs.

### Other new or changed strings (inventory, so Implement never invents)

| Surface | String                                                 | Role                              |
| ------- | ------------------------------------------------------ | --------------------------------- |
| S3      | The exchange didn't go through                         | status line (polite) on failure   |
| S3      | Starting a fresh sign-in                               | status line while retrying        |
| S3      | Try again                                              | retry button (was "Try Again")    |
| S3      | Your sign-in could not be verified                     | `Handshake` aria-label, failed    |
| S3      | Connecting your browser to Identity                    | `Handshake` aria-label, retrying (same as S1) |
| S4      | You're signed out. Sign in again whenever you're ready. | tagline slot on `LoginGate`      |
| S7      | Signing you out                                        | status line                       |
| S7      | Ending your session with Identity                      | `Handshake` aria-label            |
| D1      | Sending your credentials / Checking your code / The exchange didn't go through / Verified | status line per phase |
| D2      | Creating your account / Account created                | status line per phase             |
| D3      | Session expired (unchanged title); Your session ended; Sign back in to pick up where you left off.; Sign back in | card title; heading; body; button |

Status lines follow the house readout voice — present-participle, no terminal
period ("Winding things up", "Exchanging your code for a session"). Headings
and bodies are plain sentences with a next step.

## Screens

LED and groove legend for the sketches:

```
(○) dark / idle      (·) neutral, not on the active leg     (◉) gold, breathing (endpoint in flight)
(●) green, settled   (×) red, failed                         (▲) amber warning StatusLED (not part of Handshake)
───  groove at rest  ═══◆═══ active groove with the gold credential pulse     ═×═ failed groove
```

Every hospitality screen renders inside the existing unauthenticated shell
(`GlobalNav` above, `main` centred, minimal footer) unless stated otherwise.
Gates share one stage: atmosphere + grain backdrop and a machined card
(`LoginGate.module.css`, composed by `SessionExpiredGate.module.css`).

### S1 — LoginGate (unchanged, #4720)

```
┌───────────────────────────────────────────────────────────┐
│ GlobalNav · hospitality                          [◐ theme] │
├───────────────────────────────────────────────────────────┤
│                ┌───────────────────────────┐              │
│                │        Hospitality        │ h1 display   │
│                │ Restaurant management,    │ body/secondary│
│                │        simplified.        │              │
│                │                           │              │
│                │ ▚R▚E▚S▚E▚R▚V▚A▚T▚I▚O▚N▚S▚ │ DepartureBoard│
│                │                           │              │
│                │       [   Sign In   ]     │ primary lg   │
│                │                           │              │
│                │  Manage reservations,     │ caption/tert.│
│                │  guests, and floor plans  │              │
│                └───────────────────────────┘              │
│                                                           │
│ © 2026 Matt Butler                                        │
└───────────────────────────────────────────────────────────┘

In flight (after Sign In):
                │ (◉) Browser ═══◆═══ (◉) Identity │ Handshake lg, lane 0
                │   [ ◌ Heading to sign-in ]       │ button busy
```

- Purpose: press Sign In.
- Empty state: this is the resting state — board cycling, button live.
  `data-testid="login-prompt"`, button name exactly "Sign In".
- Loading state: board slot becomes the `Handshake` negotiating (aria-label
  "Connecting your browser to Identity"); button `isLoading` with "Heading to
  sign-in". Same slot, same height — no layout jump.
- Error state: none on this screen. A failure arrives later via `/callback`
  (S3), or Auth0 shows its own page.

### S2 — CallbackPage, negotiating and succeeded (unchanged, #4720)

```
│        (·) Browser ─────── (◉) Identity ═══◆═══ (◉) API        │ Handshake lg, lane 1
│                Exchanging your code for a session               │ caption, role=status
```

- Purpose: nothing — the operator waits and watches the credential move.
- Empty state: n/a (only rendered while an exchange is under way).
- Loading state: the screen itself. `data-testid="callback-page"`; aria-label
  "Verifying your sign-in"; the status line is a separate sentence.
- Error state: → S3, in place, same stations.
- Succeeded: immediate navigation home or to the preserved deep link. No
  inserted `settled` beat (Q3). If a zero-cost interval exists, `settled`
  (all three green, groove green) may fill it; otherwise nothing.

### S3 — Failure in place (new)

Same stage and stations as S2. The instrument turns red on the leg that
failed; the human explanation sits directly beneath; the one action is
`describeAuthError`'s call.

```
│        (·) Browser ─────── (×) Identity ═══×═══ (×) API        │ Handshake lg, failed, lane 1
│                The exchange didn't go through                   │ caption tertiary, role=status
│                                                                 │
│                  That sign-in link expired                      │ h1 display (title)
│   Sign-in links are single-use. Start again and it should go    │ body secondary
│   through.                                                      │
│                                                                 │
│                        [  Try again  ]                          │ primary lg — only when canRetry
│                                                                 │
│                      ▸ Technical details                        │ details/summary, collapsed
│                        (raw error.message, caption tertiary)    │

Access denied (canRetry = false): identical, with no button —
│                        Access denied                            │
│   Your account doesn't have access to Hospitality. Contact your │
│   administrator if you think this is a mistake.                 │
│                      ▸ Technical details                        │

Retrying (after Try again):
│        (◉) Browser ═══◆═══ (◉) Identity ─────── (·) API        │ negotiating, lane 0
│                   Starting a fresh sign-in                      │
│                  [ ◌ Heading to sign-in ]                       │ busy; heading/body stay put
```

- Purpose: understand what happened; retry when retrying can help.
- Empty state: n/a.
- Loading state: the *retrying* variant — instrument negotiating on lane 0
  (aria-label "Connecting your browser to Identity"), status "Starting a fresh
  sign-in", button busy. Heading and body remain so nothing jumps.
- Error state: this is the error state. All four categories render the same
  layout; only `title`, `body`, and the button's presence vary. Failed lane:
  1 when the failure happened on `/callback`, 0 when the redirect itself
  failed before leaving.
- Announcement: the status line changes text in place (polite); focus is not
  moved — the page is about to redirect if the operator retries, and yanking
  focus onto a heading that may vanish is worse than one polite announcement.
- Requirement for Architect (Q6): Try again must never carry the `/callback`
  URL as `returnTo`; it returns the operator home or to the pre-sign-in deep
  link.

### S4 — Signed-out state (new; Q4 recommendation)

**Recommendation: reuse `LoginGate` with a signed-out note in the tagline
slot.** Rejected alternative: a separate "You're signed out" confirmation
with its own button — it would need a second click to reach the gate, a
second surface to keep in tone, and its own E2E contract work, for a message
one line already carries.

```
│                ┌───────────────────────────┐              │
│                │        Hospitality        │ h1 display (unchanged)
│                │ You're signed out. Sign   │ tagline slot ← the only change
│                │ in again whenever you're  │ body/secondary
│                │ ready.                    │
│                │                           │
│                │ ▚R▚E▚S▚E▚R▚V▚A▚T▚I▚O▚N▚S▚ │ DepartureBoard (unchanged)
│                │                           │
│                │       [   Sign In   ]     │ primary lg (unchanged)
│                │                           │
│                │  Manage reservations,     │ caption (unchanged)
│                │  guests, and floor plans  │
│                └───────────────────────────┘              │
```

- Purpose: confirm the sign-out and offer the way back in.
- Empty state: this is the resting state. Because it *is* `LoginGate`,
  `data-testid="login-prompt"` and the "Sign In" button are present by
  construction — the E2E contract at the root URL is untouched whichever URL
  Architect chooses (Q2). At the root, the plain S1 tagline shows; at the
  post-logout return URL (today `/callback` with no params), this note shows.
- Loading state: identical to S1 in flight.
- Error state: none on this screen. A failed subsequent sign-in → S3.
- No live region: the operator arrives by a full redirect, so the h1 and the
  note are read on load like any fresh page. Reloading the page keeps the
  note — "you're signed out" is still true.
- Also true if someone lands here without signing out (a bookmark to the
  return URL): they *are* signed out, so the note is honest.
- Requirement for Architect: Sign In from here returns the operator home after
  sign-in, never to the signed-out URL.

### S5 — Refresh-failure banner (changed copy and action label)

Inside the authenticated dashboard, above the breadcrumb bar, page content
fully interactive beneath. `Banner variant="warning" dismissible` with an
`action` slot.

```
┌ Sidebar ─────┐┌──────────────────────────────────────────────────────┐
│ Timeline     ││ ▲ Your session couldn't renew and will end soon.     │ Banner warning
│ Reservations ││   Sign back in to pick up where you left off — this  │
│ Guests       ││   page is preserved.         [ Sign back in ]     × │ secondary + dismiss
│ …            ││──────────────────────────────────────────────────────│
│ Account      ││ Home › Reservations                       ● Healthy │ breadcrumb bar
│  Sign Out    ││                                                      │
│              ││ (page content — still usable while the banner shows) │
└──────────────┘└──────────────────────────────────────────────────────┘

In flight: [ ◌ Heading to sign-in ]  (button busy; banner stays)
```

- Purpose: sign back in before the session ends, without losing the page.
- Empty state: banner absent (no `refreshError`, or the current one dismissed).
- Loading state: the action button busy with `LAPSE_ACTION_BUSY`; nothing
  else changes until the browser leaves.
- Error state: this banner *is* the error state for a silent refresh. A new
  failure after dismissal shows it again.
- The button stays `secondary` inside the warning banner (as today); what is
  shared with S6 is the label, not the variant.

### S6 — SessionExpiredGate (unchanged, #4720; copy now referenced from Shared copy)

```
│                ┌───────────────────────────┐              │
│                │ (○) Browser ─────── (○) Identity │ Handshake lg, idle
│                │                           │
│                │     Your session ended    │ h1 display  = LAPSE_HEADING
│                │ Sign back in to pick up   │ body        = LAPSE_BODY
│                │ where you left off — this │
│                │ page is preserved.        │
│                │                           │
│                │     [ Sign back in ]      │ primary lg  = LAPSE_ACTION
│                └───────────────────────────┘

In flight:      │ (◉) Browser ═══◆═══ (◉) Identity │ negotiating
                │     [ ◌ Heading to sign-in ]     │
```

- Purpose: reconnect; the page they were on is restored.
- Empty state: the resting state — instrument dark, `data-testid="session-expired"`.
- Loading state: instrument negotiating, button busy.
- Error state: a failed reconnect surfaces on `/callback` as S3.

### S7 — Sign-out in flight (new, minimal)

Rendered where the `LoadingPage` renders today during a sign-out navigator,
inside the unauthenticated shell.

```
│               (◉) Browser ═══◆═══ (◉) Identity               │ Handshake lg, lane 0
│                        Signing you out                        │ caption, role=status
```

- Purpose: none — a sub-second beat that reads as an exchange, not a dead
  click, until the browser leaves for Auth0's end-session endpoint.
- Empty / loading / error: it is the loading state; there is no resting form.
  If the end-session redirect fails before leaving, the interactive error
  lands in S3 (lane 0).
- aria-label "Ending your session with Identity"; the status line is a
  separate sentence.

### LoadingPage — initial user restore (unchanged, out of scope)

```
│                    (watch movement)                    │ WatchLoader md
│                   Winding things up                     │ caption
```

Not an exchange; stays a `WatchLoader`. Sketched only because the transition
table names it.

### D1 — `/demos/login` (changed: instrument slot + status line)

rialto-web `AuthLayout` card (logotype, title, children) with links beneath.
The `Handshake` sits in a fixed slot between `Steps` and the form so nothing
below it moves when it lights.

```
              ┌──────────────────────────────────┐
              │              Rialto              │ logotype
              │      Sign in to your account     │ title
              │  ● Credentials ── ○ Verification │ Steps compact
              │  (○) Browser ───────── (○) Identity │ Handshake md, idle
              │            (status line empty)   │ caption, role=status
              │  Email address                   │
              │  [                             ] │ Input
              │  Password                  [eye] │
              │  [                             ] │
              │  □ Remember me   Forgot password?│
              │  [           Sign in           ] │ primary
              │  [ ⌖ Use a passkey instead     ] │ secondary
              │  ───────────── or ────────────── │ Divider
              │  [  Google  ]     [  GitHub  ]   │
              └──────────────────────────────────┘
                Don't have an account? Sign up
                Session expired? See how we handle it
                Back to Design System →

Submitting:   (◉) Browser ═══◆═══ (◉) Identity   Sending your credentials
              inputs disabled · [ ◌ Signing in... ]

Verification: ○ Credentials ── ● Verification
              (○) Browser ───────── (○) Identity   (status empty)
              Enter the 6-digit code from your authenticator
              [ _ _ _ _ _ _ ]                      PinInput
              [          Verify code          ]    primary (disabled until 6 digits)
              [   Use a different account     ]    ghost

Verifying:    (◉) Browser ═══◆═══ (◉) Identity   Checking your code
              PinInput disabled · [ ◌ Verifying... ]

Rejected:     (×) Browser ═══×═══ (×) Identity   The exchange didn't go through
              [ 0 0 0 0 0 0 ]  hint: That code didn't match — try again   (PinInput error)
              [          Verify code          ]

Accepted:     (●) Browser ─●─●─●─ (●) Identity   ✓ Verified            (700 ms beat)
              → toast: Signed in successfully
```

- Purpose: the reference sign-in a consumer copies — every phase visible in
  one slot.
- Empty state: fields empty, instrument idle, status line empty (an empty
  polite region announces nothing).
- Loading state: *submitting* and *verifying* — negotiating on lane 0 with
  the phase caption; the button busy text is unchanged from today.
- Error state: *rejected* — instrument failed plus the `PinInput` hint;
  editing the code clears both (instrument back to idle). Inline email
  validation is a field error only; the instrument never reacts to local
  validation because nothing was exchanged.
- aria-labels: idle "Sign-in exchange at rest"; submitting "Sending your
  credentials to Identity"; verifying "Checking your code with Identity";
  failed "Identity rejected the code"; settled "Signed in — your browser and
  Identity agree".
- "Use a different account" resets to step 1 with the instrument idle.

### D2 — `/demos/signup` (changed: instrument slot + status line)

```
              │              Rialto              │
              │       Create your account        │
              │  (○) Browser ───────── (○) Identity │ Handshake md, idle
              │            (status line empty)   │
              │  Full name / Email / Password (+ strength meter + checklist)
              │  Confirm password                │
              │  □ I agree to the Terms … Privacy Policy
              │  [        Create account       ] │ primary
              │  ───────────── or ────────────── │
              │  [  Google  ]     [  GitHub  ]   │
                Already have an account? Sign in

Submitting:   (◉) Browser ═══◆═══ (◉) Identity   Creating your account
              inputs disabled · [ ◌ Creating account... ]
Success:      (●) Browser ─●─●─●─ (●) Identity   Account created
              → toast: Account created successfully
```

- Purpose: reference sign-up; the instrument lights only for the exchange.
- Empty state: fields empty, instrument idle.
- Loading state: *submitting*.
- Error state: the demo has no exchange failure; email and password-mismatch
  errors are inline field hints and leave the instrument idle.
- aria-labels: idle "Sign-up exchange at rest"; submitting "Creating your
  account with Identity"; settled "Account created — your browser and Identity agree" (amended 2026-08-31 after Verify: PRD criterion 11 requires the img label and the status line to be different sentences — the original "Account created" pair was a spec defect; tracker #4770).

### D3 — `/demos/session-expired` (changed: lapsed state matching S6)

```
              │              Rialto              │
              │         Session expired          │ title (unchanged)
              │  (○) Browser ───────── (○) Identity │ Handshake md, idle
              │                                  │
              │  (▲) Your session ended          │ StatusLED warning pulse + heading = LAPSE_HEADING
              │  Sign back in to pick up where   │ body = LAPSE_BODY_DEMO
              │  you left off.                   │
              │  [         Sign back in        ] │ primary = LAPSE_ACTION
                Don't have an account? Sign up
                Back to Design System →
```

- Purpose: show the lapse the way hospitality shows it, then route to D1.
- Empty state: the resting state — instrument dark, amber telltale breathing
  (the existing test's anchor: `variant="warning"`, `pulse`).
- Loading state: none — the demo routes to D1 on the button; there is no
  exchange to show, and pretending one would make the demo lie.
- Error state: none.
- The body deliberately omits "this page is preserved" (see Shared copy).
- Note for Implement: the existing test clicks `/sign in/i`; "Sign back in"
  does not match that regex, so the assertion changes with the label.

### D4 — `/demos/auth-flow` (consumer-facing view; reading undecided, Q1)

What the consumer sees today and must still see under either reading:

```
  Auth Flow                                                          h1
  The OIDC authorization-code + PKCE dance … one signal at a time.   intro

  ┌ OIDC flow diagram ───────────────────────────────────────────┐
  │   [ Browser ]      [ Identity Provider ]      [ API ]         │ station cards: LED, name, role
  │   Single-page app   Authorization server    Resource server  │
  │                                                              │
  │   SPA ⇄ IDENTITY PROVIDER   ═════════◆═════════              │ channel 1 (hand-rolled groove)
  │   SPA ⇄ API                 ─────────────────────────────    │ channel 2 (hand-rolled groove)
  └──────────────────────────────────────────────────────────────┘
                     ▚A▚U▚T▚H▚O▚R▚I▚Z▚E▚                          SplitFlap readout
      You click Sign in. Before anything leaves the browser…        caption, aria-live polite
      [ Play ] [ Next ] [ Reset ]        ( ) Simulate tampered state
```

What a consumer should learn here (all carried by the captions and readout,
which survive both readings): sign-in is a three-party exchange with the
browser as the hub; the code is single-use and only ever exchanged together
with the verifier; the API sees only the access token; refresh is silent and
loops; a tampered callback is rejected before any exchange happens.

**Reading (a) — `Handshake` grows.** The panel becomes the same instrument
the consumer met on `/demos/login` and in hospitality, now able to show the
walkthrough's extra facts: the pulse travels one way per step (outbound
away from the browser, inbound toward it) instead of shuttling; the API
channel is its own lane; per-station LEDs can differ within one step (for
example Identity green while Browser is gold on the CODE step). The consumer
sees one instrument family across the whole design system, with the richest
version here. Cost, from the consumer's seat: none; the cost is a rialto API
change with a changeset.

**Reading (b) — the walkthrough simplifies to today's `Handshake`.** The
panel becomes one large `Handshake` whose stations are ordered hub-style —
**Identity — Browser — API** — so lane 0 is Identity ⇄ Browser and lane 1 is
Browser ⇄ API; both real channels are honest legs, which the current
Browser — Identity — API order (used by `CallbackPage`) cannot give the
walkthrough because Identity and API never talk to each other. The station
cards keep their role lines beneath the instrument's own labels, or the
instrument's labels replace them. Per step, the consumer sees:

| Step           | Instrument                          | What is lost versus today                    |
| -------------- | ----------------------------------- | -------------------------------------------- |
| AUTHORIZE      | idle (nothing on the wire)          | Browser's lone gold LED                      |
| REDIRECT       | negotiating, lane 0                 | outbound direction                           |
| CODE           | negotiating, lane 0                 | inbound direction; Identity's green LED      |
| EXCHANGE       | negotiating, lane 0                 | outbound direction                           |
| TOKENS         | settled                             | API turns green too, although not yet called |
| API CALL       | negotiating, lane 1                 | outbound direction                           |
| REFRESH        | negotiating, lane 0 (shuttle loops) | nothing — the loop is the shuttle            |
| REJECTED       | failed, lane 0                      | Identity also turns red (it did nothing wrong) |

**UX view on direction (the PRD's question to this stage):** per-step
direction is not load-bearing for a consumer. The captions already say
"redirects to" and "redirects back", the readout names the step, and a
shuttling pulse reads as *an exchange is happening between these two* —
which is the thing a consumer needs the picture for. What (b) actually
costs is finer: the per-station nuance (who has finished, who is untouched)
on TOKENS and REJECTED. Either is defensible; the hub ordering is what
makes (b) honest at all.

- Purpose: understand the protocol by watching it, one signal at a time.
- Empty state: paused on AUTHORIZE with the instrument idle (b) or the
  Browser LED alone lit (a).
- Loading state: none — every step is a resting picture; playback is a timer.
- Error state: the tampered branch — REJECTED with the instrument failed and
  Next inert until Reset; not an error of the page.
- Survives both readings (PRD): seven steps, the tampered branch, Play /
  Pause / Next / Reset, pause when hidden, `dir="ltr"` on the schematic.

## Conventions to match

Grounded in `packages/rialto/CLAUDE.md`, the `Handshake` showcase page, and
the #4720 gates.

- **Instrument semantics.** `Handshake` is `role="img"` with a required
  `aria-label` that describes the exchange, never the LEDs; the status line
  is a separate `role="status"` / `aria-live="polite"` sentence so a screen
  reader hears the step once. The LEDs are never the only signal — a caption,
  heading, or field hint always carries the words.
- **Surgical colour.** Gold appears only while something is in flight (the
  pulse, the breathing endpoints) and on primary buttons. `failed` uses the
  error token, `settled` the success token, the lapse telltale and banner the
  warm amber warning token — none of these are chosen here; the components
  own them.
- **One stage for every hospitality gate.** S3, S4, and S7 compose the
  atmosphere / grain / card rules from `LoginGate.module.css` exactly as
  `SessionExpiredGate.module.css` does, never duplicating them. Card
  `max-width` 480 px; `Handshake` `width: min(100%, 320px)` (360 px on the
  three-station callback).
- **Typography on gates.** Headings are `Text as="h1" variant="display"`,
  bodies `Text variant="body" color="secondary"`, status lines
  `Text variant="caption" color="tertiary"`, matching the three existing
  gates. (rialto's own guidance prefers `Heading` for semantic headings; the
  gates predate it — match the gates, and let Architect decide whether to
  migrate all three together, not one.)
- **Buttons.** One primary `size="lg"` action per gate; `secondary` inside
  the banner; `ghost` for back / alternate paths on the demos. In-flight
  buttons use `isLoading` + `loadingText`; the resting label of the gate's
  button is exactly "Sign In" (E2E contract) and every other button is
  sentence case.
- **Copy voice.** Status lines: present-participle readouts, no terminal
  period. Headings: short human sentences. Bodies: one or two sentences
  ending in a concrete next step. Station names: "Browser", "Identity",
  "API".
- **Motion.** All motion through `useMotionPreset()`; `Handshake` and
  `DepartureBoard` handle reduced motion themselves (pulse parks mid-groove,
  LEDs stop breathing, board holds one phrase); no new travelling element
  anywhere — the `Handshake` is the one visualisation.
- **Layout shift.** In-flight swaps happen in a slot of the same height (S1's
  board ↔ instrument; the demos' fixed instrument slot). Nothing beneath moves
  when a state changes.
- **Non-blocking banner.** `Banner variant="warning" dismissible` with the
  `action` slot, above the breadcrumb bar, content beneath still interactive.
- **Mobile (375 px).** Cards go full width with reduced padding (existing
  `<640px` rules); the instrument scales with `min(100%, …)`; the banner's
  action wraps beneath its text; the walkthrough panel keeps its existing
  compact padding.
- **E2E contract (untouched).** `data-testid="login-prompt"`, a button named
  exactly "Sign In", `data-testid="auth-layout"`; also the existing
  `callback-page` and `session-expired` test ids.
- **Hospitality-wide.** Every element is a rialto component; tokens only;
  logical properties; `.js` import extensions — restated, not designed.

## Deliberately not designed

- The URL of the signed-out state (Q2) and how `returnTo` is preserved or
  reset on retry and on sign-in from the signed-out state (Q6) — Architect;
  only the requirement "never return to the signed-out or `/callback` URL"
  is stated here.
- Whether the demos name their phases with `useAuth()`'s vocabulary (Q7) and
  whether a sign-out E2E case is feasible (Q8).
- An account-switch path from *Access denied* (today: no action; the
  operator contacts an administrator).
- A signed-out phrase on the departure board, and a warning-LED telltale on
  hospitality's `SessionExpiredGate` (surfaced above as a parity question).
- `LoadingPage` / the initial user restore; the `AuthConfigError` screen;
  Auth0's hosted login, logout, and error pages; the embedded `SignInDemo` in
  `SplitScreenExitPage.tsx`.
- Toast copy and timing on the demos (unchanged: "Signed in successfully",
  "Account created successfully", 700 ms verified beat).
- Restoring the never-defined classes in `AuthLayout.module.css` (surfaced) —
  a finding for Architect, not a design.
- Any visual value beyond the component props named (`size`, `variant`,
  `lane`, `state`) — colours, radii, shadows, and easing belong to the tokens.

## Coverage check

Every PRD user story with a UI surface is reachable through a flow above:

| Story | Actor    | Reached by                                                                 |
| ----- | -------- | -------------------------------------------------------------------------- |
| 1     | Operator | Flow 2 → S4 (signed-out state offering Sign In; never `CallbackPage`)      |
| 2     | Operator | Flow 3 → S3 (failed in place, category copy, retry iff it can help)        |
| 3     | Operator | Flow 4 → S5 + S6 with the Shared copy block (one voice, one action label)  |
| 4     | Operator | Flow 1 (S1 in flight, S2), Flow 2 (S7), Flow 3 (S3 retrying)              |
| 5     | Consumer | Flow 5 → D1 (submitting, verifying, failed, settled); Flow 6 → D2; D3 lapsed |
| 6     | Consumer | Flow 7 → D4 under reading (a) or (b)                                       |
| 7     | Maintainer | No UI of their own. "Behaves deliberately before I add it" is Flow 2 step 4 at today's `/callback` (S4 renders there with no params); "the exact Auth0 value called out" is a documentation deliverable Architect fixes with Q2 — outside UX. |

Every transition in the PRD table has a sketch: S1, S2 (negotiating and
succeeded), S3, S4, S5, S6, LoadingPage, D1, D2, D3, D4 — plus S7, which the
table omits and story 4 requires.

Next stage: Architect — inputs from here are the Q4 recommendation (S4), the
Shared copy block (Q5), the Q3 ruling as applied to S2, the two readings of
D4 with the hub-ordering note, the four surfaced items, and the S3/S4
`returnTo` requirement.
