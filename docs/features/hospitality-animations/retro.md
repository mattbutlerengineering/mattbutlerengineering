---
stage: operate
run: feature:hospitality-animations
date: 2026-09-03
---

# Retro: Neon OPEN sign

Written two days after the merge. `idea.md` set no usage metric — it recorded no
user reports and no rialto-web instrumentation — so "success is provable only by
tests and the showcase". That framing is honest but it caps what this retro can
claim, and the cap turns out to be the most useful thing in it.

## Outcomes vs. intent

### The instrument exists where a user can actually reach it

- **What happened:** verified live, with a browser, against
  `https://mattbutlerengineering.com/rialto/components/neon-sign` — not against
  a test, and not against an HTTP status. That distinction matters here:
  `apps/rialto-web/wrangler.toml` sets
  `not_found_handling = "single-page-application"`, so **every** path under
  `/rialto/` returns `200`. A curl check would have "passed" against a URL that
  does not exist. The rendered page carries:
  - the page itself, reachable from the "Data Display" nav group (20 entries);
  - all four states as `role="img"` with real accessible names — `Open until
10:00 PM`, `Opens at 5:00 PM`, `Closed, opens Tuesday at 5:00 PM`, `No
operating hours set`;
  - `unset` rendering **no tube child**, only the housing — the one state whose
    correctness is an absence, and the one a snapshot test is least likely to
    catch.
- **Signal strength: measured**, on the deployed surface.

### The dashboard consumer — the thing the idea was actually about

- **What happened:** **not verified in production.** The hospitality dashboard
  is behind Auth0 and this run had no authenticated session, so nobody has
  observed which state the live header renders. `HomePage.test.tsx` covers all
  four states plus no-venue, and that is the whole of the evidence.
- **Signal strength: none in production.** Worth stating bluntly, because the
  showcase being green makes it easy to feel the feature is confirmed. The
  showcase proves the _instrument_. The dashboard is where the idea lives, and
  it is unobserved.
- This is not an oversight the run can close by trying harder: the tracking
  issue #4746 flagged it before Implement started, under "Human step (not an
  issue)" — the deployed demo venue's `operatingHours` and `ianaTimezone` are
  unknown, and nothing in the repo can read or set them. If they are unset, the
  live header correctly shows `unset` — right behaviour, wrong demo.

### External consumers of the design system

- **What happened:** **undeterminable from here, and the run should not claim
  otherwise.** `npm view @mattbutlerengineering/rialto` returns 404, but
  `npm whoami` returns **401** — the local credentials are expired, and npm
  answers 404 rather than 403 for private scoped packages to unauthenticated
  clients. So the 404 is consistent with "unpublished" _and_ with "published,
  restricted, and we are not logged in". A control lookup
  (`npm view @types/node`) resolved fine, which only confirms the client works.
- What _is_ measured: `packages/rialto/package.json` on `main` is still
  `0.2.0`, and `.changeset/` holds **22 unconsumed changesets** — including
  this run's `neon-sign-instrument.md` (minor), and two `major` entries
  (`DateRange` ISO migration, `AuthMascot` removal). Whatever the registry
  state, no version carrying `NeonSign` has been cut from this repo.
- **Signal strength: mixed** — the changeset backlog is measured; the
  publication state is not, and is recorded as unknown rather than guessed.

## Run retrospective

- **Keep: probing the deployed page with a real browser.** The SPA fallback
  makes every URL return `200`, so status-code probing is actively misleading
  on this surface. The browser check is the only one that distinguishes "the
  page exists" from "the router serves the shell for anything you type".
- **Keep: cross-checking a third-party console error before believing it.** The
  page logged `ERR_CONNECTION_REFUSED` for
  `static.cloudflareinsights.com/beacon.min.js`. Local resolver → `0.0.0.0`;
  `1.1.1.1` and `8.8.8.8` → real IPs; fetch via the real IP → `HTTP 200`. A LAN
  DNS sinkhole on the probing machine, not a production failure. Skipping that
  three-line check would have put a fabricated third-party outage in this
  document.
- **Keep: flagging the human-input dependency at Decompose, not at Verify.**
  #4746 named the unknown venue hours before any code was written, which is why
  the gap above is a known limit rather than a surprise.
- **Change: a feature whose value lives behind auth needs an auth'd check in
  its plan.** The PRD's own note — "success is provable only by tests and the
  showcase" — quietly accepted that the dashboard would never be observed. That
  was true and it was also the wrong thing to accept: it means the run's
  headline deliverable has zero production evidence, by design, and nothing
  downstream flags it.
- **Change: tracking bodies drift silently.** #4746 showed #4738 unchecked two
  days after the issue closed. Corrected this stage, but nothing detects it —
  the mirror can disagree with the tracker it mirrors and neither side notices.
- **Stop: treating a green showcase as coverage of the consumer.** They are
  different surfaces with different deploy paths and different auth, and only
  one of them was checked.

## Idea seeds

Appended to `docs/backlog.md`:

- Give the hospitality dashboard an authenticated production smoke check, so a
  feature that only exists behind Auth0 can have production evidence at all.
- Reconcile a `/decompose` tracking issue's checkboxes against the real state
  of the issues it references.
- Resolve what is actually published as `@mattbutlerengineering/rialto`, and
  cut a release for the 22 pending changesets.

Carried from the run, unchanged:

- The demo venue's `operatingHours` / `ianaTimezone` remain a human step;
  #4746 stays open for it, with a comment recording exactly what is left.

## Run complete

Closed 2026-09-03. The instrument is live and correct on the showcase; the
dashboard consumer that motivated it is shipped, tested, and unobserved.
