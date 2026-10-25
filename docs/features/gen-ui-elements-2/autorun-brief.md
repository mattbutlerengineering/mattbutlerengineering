# Autorun brief — gen-ui-elements-2

Collected 2026-10-24 by the autorun orchestrator. The Owner answered each
question live, one at a time; their answers are marked **(Owner)**. This
file is the brief, not an artifact: it never counts toward orientation.

## Why this run

Wave 1 of generative-UI elements shipped the same day, outside the
pipeline: #7456 (Stat, Timeline, Tag, StatusLED in the json-render
catalog), #7458 (StatusLED shows its label), #7460 (Text and Badge words).
#7462 (words required only for leaf Text/Badge; /gen prompt says
`children` means child keys) was in review when this brief was written.
Live evidence for all of it is in `docs/ui-quality/chat-scenarios-2026-10-24.md`
(batches 1–7d). This run is wave 2. **(Owner)**

## Feature description (what / why)

**What.** Fitting generative-UI elements for the hospitality chat's
remaining read-tool data shapes, plus prompt guidance:

- a reservation row / list (guest, time, party size, status) for
  `lookup_reservation` and `list_today_reservations`;
- an availability time-slot list for `check_availability`;
- a guest summary card (name, visits, tags, risk) for `search_guests`.

It also closes two open findings from the scenario log: **F25** (Timeline
timestamps longer than the label column overlap the event dot) and **F26**
(suspected: on /gen the first Generate click after typing a prompt sent no
request, twice; a second click worked; not yet reproduced by hand).

**Why.** See the Idea inputs below.

## Run scale

Feature run, slug `gen-ui-elements-2`, artifacts under
`docs/features/gen-ui-elements-2/`. **(Owner)**

## Idea inputs (Owner approved this draft)

- **Problem (sufferer's view):** when staff ask the chat about bookings,
  openings or a guest, the answer comes back as plain text or a generic
  table, which is hard to scan mid-service.
- **Who / how they cope today:** front-of-house staff using the
  hospitality dashboard's chat. Today that is only the Owner's own demo
  venue. They cope by reading prose.
- **Why now:** wave 1 proved the pattern live. Stat and labelled StatusLEDs
  render in the chat, Tag and Timeline in /gen, with zero seam fallbacks
  after the fixes.
- **Evidence:** _anecdote_, the Owner's own live scenario batches 1–7d in
  `docs/ui-quality/chat-scenarios-2026-10-24.md`. There are no real staff
  users yet. Label it as anecdote.
- **Solution hunch:** one fitting element (or a documented composition)
  per data shape, plus a line of chat-prompt guidance mapping each tool's
  data to it, as wave 1 did.
- **Success (one sentence):** in one live scenario batch, every chat read
  tool's data renders in a fitting element with 0 "Component could not be
  displayed".
- **Biggest unknowns / ways this dies:**
  - whether the model picks the right element unprompted (wave 1 showed it
    often answers in prose instead);
  - catalog prompt-token growth (currently ~7.4k tokens; each element adds
    roughly 100);
  - whether existing rialto components can be composed or new ones are
    needed. This is left to the Architect.

## Scope

**In:** the three data shapes above, F25, F26, chat prompt guidance, and
live verification in prod (chat drawer plus /gen).

**Out:**

- charts (rialto has none);
- interactive widgets (`emit`/`on` are no-ops in the chat);
- waitlist and menu tools (F12);
- the rialto npm publish (`RIALTO_PACKAGES_TOKEN` is unset).

**Constraints and lessons from wave 1:**

- Elements are display-only.
- Nested array strings carry no `.max()`, because the seam clamps only
  top-level `charLimits` and a nested limit drops the whole element.
- Enum-like nested fields accept any string, and the adapter tolerates
  unknown values.
- Props the model must fill are required, because the model skips optional
  words.
- Catalog descriptions avoid inner double quotes (the generator and the
  commit-time prettier disagree on them).
- Rialto source changes need a patch changeset.
- Live-test every element in prod before calling it done.

## UX surface

Yes: the elements render in the hospitality chat and in /gen.
`ux: required`.

## Tracker

No tracker interaction. **(Owner)** No issues are created or seeded, and
nothing is labelled `ready`, so the always-on drain cannot claim this run's
items.

## Release authorization

**Authorized (Owner):** Ship may merge the run's PR(s) once the reviewer
subagent passes and `CI Gate` is green, using an explicit squash subject
(`gh pr merge <N> --squash --subject "<subject> (#<N>)"`). CI then deploys
(static sites, agent-api, Pulumi for /gen). Ship verifies each deploy at
**job** level, not by the workflow rollup.

Never merge past an unfixed critical review finding. No rialto npm publish.

## Operate

- `minimum-signal:` one logged live scenario batch in
  `docs/ui-quality/chat-scenarios-*.md` that exercises the wave-2 elements
  in prod. **(Owner)**
- `wait: 1 day` **(Owner)**
- `users-observed:` counted from signal the stage finds; `0` beyond the
  Owner is the honest count if that is all there is.

## Standing instructions to every stage subagent

Answer interview questions from this brief. Where it is silent:

- If the stage skill offers named options with a recommended default, take
  the default and log it under `assumptions:` in the artifact's
  frontmatter.
- Otherwise, stop and surface. Never guess an evidentiary answer.

Run the repo's real commands for verification. Repo pipeline hooks
(CLAUDE.md § Pipeline Stage Hooks):

- run the `local-ci-precheck` steps before the first push and at ship
  pre-flight;
- run the knowledge-base harvest at the operate retro.
