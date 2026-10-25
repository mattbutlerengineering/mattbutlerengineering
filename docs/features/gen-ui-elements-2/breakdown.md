---
stage: decompose
run: feature:gen-ui-elements-2
date: 2026-10-24
assumptions:
  - "No live review of the cut: this is an autorun stage. The milestone boundaries and PR groupings below are the Decompose agent's, taken from architecture.md and the orchestrator's sequencing guidance (small, independently mergeable PRs). The Owner has not seen them."
  - "No tracker interaction (brief § Tracker): no GitHub issues were created or imported, nothing was labelled ready, and no item carries a (tracker: #N) reference. The checkboxes here are the only state."
  - "No decompose lessons: docs/factory/decompose-lessons.jsonl does not exist in this repo, so the draft uses no past-run lessons."
  - "Live prod verification is not an Implement checkbox. The PRD's live-batch, zero-fallback, prompt-size and live F25 criteria can only be measured after Ship merges and CI deploys (brief § Release authorization). An Implement checkbox that needs a prod deploy could never be checked before Verify, which would deadlock the pipeline's Implement gate. Milestone 5 therefore lists them as Verify/Ship obligations in plain bullets, not checkboxes. The F26 not-reproducible route is the exception: its scenario-log entry is written in Implement (item F26) because it needs no deploy."
  - "One PR per component, merged in series. The three rialto components each touch the shared generated files (generated-schemas.ts, generated-catalog.ts, registry.json, the rialto exports map, llms*.txt). Separate PRs keep each reviewable, but the second and third must be rebased onto main and regenerated after the one before merges, rather than opened in parallel. The alternative, one PR for all three, was rejected as too large to review against the wave-1 constraints."
  - "Changeset per rialto PR: every PR that changes packages/rialto/src carries its own .changeset/*.md patch entry for @mattbutlerengineering/rialto (brief constraint; packages/rialto/CLAUDE.md pre-1.0 patch convention; check-changeset.sh / CI gate). Multiple patch changesets collapse into one patch release, so this costs nothing at version time."
---

# Breakdown: Fitting chat elements for reservations, availability and guests (wave 2)

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

## Shared rules for every item

These apply to every checkbox below and are not repeated per item.

- **Test first (mandatory, CLAUDE.md § Feature Implementation).** Each item
  names its first failing test. Write it, run it, and see it fail for the
  right reason before writing the implementation. Then make it pass.
- **Gates before an item is checked:** `pnpm --dir <pkg> test`,
  `pnpm --dir <pkg> lint` and `pnpm --dir <pkg> typecheck` in every package
  the item touches, plus `pnpm typecheck` at the root before the PR's push
  (vitest does not typecheck; gotchas § Pre-push).
- **Before the first push of each PR:** run the steps in
  `.claude/skills/local-ci-precheck/SKILL.md` (CLAUDE.md § Pipeline Stage
  Hooks, `implement` row) and record the result in the PR body.
- **Generated artifacts:** build the CLI first
  (`pnpm build --filter @mbe/cli...`, which also builds `agent-core`) so
  the pre-commit hook `precommit-llms-stage.mjs` can regenerate and stage
  `llms.txt`/`llms-full.txt`. When a catalog meta or a catalog description
  changes, run `pnpm --filter @mbe/rialto-catalog generate` and commit
  `generated-schemas.ts` and `generated-catalog.ts`. When a rialto
  component folder is added, wire it in `src/components/index.ts` and run
  `pnpm --dir packages/rialto build` to regenerate `registry.json` and the
  `exports` map. Check `pnpm regen --check` is clean before pushing.
- **Rialto changes:** any change under `packages/rialto/src` ships a
  `.changeset/*.md` patch entry for `@mattbutlerengineering/rialto` in the
  same PR. No npm publish.
- **Wave-1 schema rules** (PRD criterion "Wave-1 constraints hold"): elements
  are display-only; no nested string carries `.max()`; enum-like nested
  fields are `z.string()`; words the model must fill are required at the
  top level; catalog descriptions contain no inner double quotes.
- **Rialto:** no `setState` inside a `useEffect` body (pre-commit ban).

## Milestone 1: The two open findings are closed (F26, F25)

Demonstrable: one click on /gen's Generate sends a request, and a Timeline
with long timestamps keeps its dots in one clear column. These two items
touch nothing else in this run and can merge in either order.

- [x] **F26: PromptBar first click always sends** (PR A, `apps/gen`) — keep
      the hints line always mounted and show it through
      `.bar:focus-within .hints`; delete the `isFocused` state and the
      `onFocus`/`onBlur` handlers in `apps/gen/src/components/PromptBar.tsx`.
  - Test first: in `apps/gen/e2e/playground.spec.ts`, `fill` the prompt,
    `click` Generate once, and expect exactly one recorded `POST /api/gen/ui`
    through `gen-api-mocks`, plus the Generate button's bounding box equal
    before and after blur. Run it against the unchanged PromptBar and
    confirm it goes red. Add a jsdom case to `PromptBar.test.tsx` asserting
    the hints element is mounted while the textarea is unfocused.
  - Accept: the e2e test was seen red on the old code and is green on the
    new; the jsdom test passes; `pnpm --dir apps/gen test`, `lint` and
    `typecheck` pass; the hints line is visible while the textarea (or
    either button) has focus and hidden otherwise, with the bar's height
    unchanged across focus.
  - Accept (alternate route): if the e2e test cannot be made to go red on
    the old code, no PromptBar change is made. Instead a dated entry in
    `docs/ui-quality/chat-scenarios-2026-10-24.md` records the reproduction
    steps tried and their results and marks F26 not reproducible (PRD
    "F26 closed", second route). The Notes section below records which
    route was taken.
  - Blocked by: —

- [x] **F25: Timeline shared timestamp column** (PR B, `packages/rialto`) —
      `.timeline` becomes a grid with columns `fit-content(33%) auto 1fr`;
      each `.item` uses `grid-template-columns: subgrid`; `.timestamp` gets
      `min-width: 64px` (48px compact), drops `white-space: nowrap`, and
      gains `overflow-wrap: anywhere`. Change the Timeline catalog
      description to drop "tonight's reservations in arrival order" and keep
      "a guest's visit history".
  - Test first: add a `LongTimestamps` story to `Timeline.stories.tsx`
    (timestamps such as "March 3, 2025", normal and compact) and a
    Playwright geometry assertion in
    `packages/rialto/src/test/visual/visual.spec.ts`: every timestamp's
    right edge is at or left of its node's left edge, and every node shares
    one x. Confirm it fails on the current CSS.
  - Accept: the geometry assertion is green on the new CSS; existing
    `Timeline.test.tsx` and the a11y matrix still pass (each item keeps
    `role="listitem"`); `generated-catalog.ts` is regenerated for the
    description change; a rialto patch changeset is present.
  - Accept: the PR notes whether existing Timeline visual baselines moved.
    Stale baselines are regenerated only through
    `visual-baseline-regen.yml`, never from macOS (gotchas § CI). The rialto
    visual workflow is advisory, not `CI Gate`.
  - Blocked by: —

## Milestone 2: The model gets venue-local times

Demonstrable: the reservation and slot read tools return `localTime` next
to every ISO time. This is independent of every rialto item.

- [x] **Read tools add `localTime`** (PR C, `services/agent`) — in
      `services/agent/src/routes/gen-agent-tools.ts`, `lookup_reservation`
      and `list_today_reservations` add `localTime` (venue `HH:mm`, from
      `startTime` in the request's `timeZone`, UTC when none) to each
      reservation; `check_availability` adds `localTime` to each slot. Use
      the same `Intl.DateTimeFormat` approach as `todayIn`.
  - Test first: tool tests asserting `localTime` for a known ISO time in a
    non-UTC zone (for example `America/Los_Angeles`), in UTC when no zone
    is given, across a date boundary, and absent (no throw) for an
    unparseable time. Confirm they fail before the change.
  - Accept: all three tools return the existing fields unchanged plus
    `localTime: "HH:mm"`; an unparseable ISO time omits `localTime` and
    does not throw; existing `{ error }` replies are unchanged;
    `pnpm --dir services/agent test`, `lint` and `typecheck` pass.
  - Blocked by: —

## Milestone 3: The rialto words and the three elements

Demonstrable: each element renders in /gen from a hand-written spec, with
its words in all four locales, and drops a bad row instead of falling back.

- [x] **Locale keys, normalizer and vocabulary drift test** (PR D,
      `packages/rialto` + `apps/hospitality`) — add `partyOf(n)`,
      `visitCount(n)`, `reservationStatus` (pending, confirmed, cancelled,
      completed, noShow, seated), `guestRisk` (trusted, standard, risky),
      `walkIn`, `noOpenTimes`, and the accessible list names
      `reservations`, `openTimes`, `guests` to `RialtoMessages`, with values
      in en-US (inline), en-GB, es-MX and fr-CA. Add the pure status and
      risk normalizer module (trim, upper-case, spaces and hyphens to `_`;
      unknown gives no key and a neutral tone; the tone tables copied from
      the dashboard).
  - Test first: normalizer unit tests (`"No show"`, `"no-show"`,
    `"NO_SHOW"` all resolve to noShow with error tone; `"seated"` resolves;
    an unknown value gives `key: undefined` and neutral; risk tones match
    risky error, standard warning, trusted neutral); a locale test that
    every new key exists in every locale with es-MX and fr-CA plurals for
    `partyOf` and `visitCount`; and
    `apps/hospitality/src/i18n/chat-element-vocabulary.test.ts`, asserting
    for each locale that rialto's `reservationStatus`, `guestRisk` and
    `walkIn` equal the app catalog's `timeline.status.*`, `crm.risk.*` and
    `home.reservations.walkIn`. Confirm each fails first.
  - Accept: all three test groups pass; `pnpm --dir packages/rialto` and
    `pnpm --dir apps/hospitality` test, lint and typecheck pass; rialto
    patch changeset present.
  - Blocked by: —

- [x] **ReservationList element** (PR E, `packages/rialto` +
      `packages/rialto-catalog`) — new
      `packages/rialto/src/components/ReservationList/` (component, CSS
      module, story, `ReservationList.catalog.ts`, barrel export), and its
      adapter in `packages/rialto-catalog/src/registry.tsx`.
  - Test first: a component test (rows render time, guest or the localized
    Walk-in, localized party size and the status word in its Badge tone; an
    unknown status shows verbatim in neutral; the list is a `<ul>` named by
    the locale message; nothing is focusable), and registry tests in
    `registry-full.test.tsx` (a row missing time, partySize or status is
    dropped; `partySize: "4"` is coerced and `"four"` drops the row;
    `SeamFallback` only when no row survives). Add the meta-level schema
    test that walks each new `propSchemas` for `.max(` and `z.enum(` and
    fails on either. Confirm all fail first.
  - Accept: those tests pass; an a11y-matrix fixture in
    `packages/rialto/src/test/accessibility/component-fixtures.tsx` renders
    it with zero axe violations; the row fits 300px with no horizontal
    scroll (story at 300px); `generated-schemas.ts`, `generated-catalog.ts`,
    `registry.json` and the exports map are regenerated and committed;
    rialto patch changeset present.
  - Blocked by: Locale keys, normalizer and vocabulary drift test

- [x] **TimeSlots element** (PR F) — new
      `packages/rialto/src/components/TimeSlots/` (component, CSS module,
      story, `TimeSlots.catalog.ts`, barrel export) and its adapter.
  - Test first: a component test (the date line reads "{date} ·
    {partyOf(n)}"; times render as static Tag-look labels that wrap; an
    empty `times` shows the localized no-open-times line, never an empty
    box) and registry tests (blank times are dropped; a missing `date`
    falls back; `partySize` is coerced; an over-long `date` is clamped with
    "…" at its 40-char limit, not dropped). Confirm they fail first.
  - Accept: those tests pass; the meta-level schema test covers TimeSlots;
    a11y-matrix fixture with zero axe violations; generated files, registry
    and exports regenerated; rialto patch changeset present. The PR is
    rebased onto main after PR E merges and regenerated before push.
  - Blocked by: ReservationList element (shared generated files; serial
    merge)

- [x] **GuestCards element** (PR G) — new
      `packages/rialto/src/components/GuestCards/` (component, CSS module,
      story, `GuestCards.catalog.ts`, barrel export) and its adapter.
  - Test first: a component test (one card per guest; name in the display
    face; localized visit count and risk word in its Badge tone on one
    line; tags row omitted when there are no tags; no email, phone, notes
    or spend ever rendered; cards separated by spacing, not nested boxes)
    and registry tests (a card missing name, visits or risk is dropped;
    `visits` coerced; fallback only when no card survives; tags optional).
    Confirm they fail first.
  - Accept: those tests pass; the meta-level schema test covers GuestCards;
    a11y-matrix fixture with zero axe violations; generated files, registry
    and exports regenerated; rialto patch changeset present. Rebased and
    regenerated after PR F merges.
  - Blocked by: TimeSlots element (shared generated files; serial merge)

## Milestone 4: The chat maps each tool to its element

Demonstrable: the agent's system prompt names the fitting element for every
read tool, pinned by tests, and the hospitality chat registry renders all
three new elements.

- [x] **Chat prompt guidance per shape** (PR H, `services/agent` +
      `apps/hospitality`) — in
      `services/agent/src/routes/gen-agent-prompt.ts`, replace the single
      "Pick the element…" line with one line per shape: reservations to
      ReservationList (arrival order, time from `localTime`, raw `status`
      copied, cancelled and no-show rows left out for tonight questions);
      open slots to TimeSlots (open times only; a closed or fully booked day
      in words, never this element); guests to GuestCards (at most five,
      then say how many more matched); visit history to Timeline; table
      statuses to StatusLED, counts to Stat, tags to Tag, other lists to
      Table. Timeline is no longer named for a night's bookings.
  - Test first: one assertion per shape in `gen-agent-prompt.test.ts`
    (each mapping line present; no line maps a night's bookings to
    Timeline), and a case in
    `apps/hospitality/src/components/chat-panel-registry.test.tsx` that
    each of ReservationList, TimeSlots and GuestCards renders (not the
    fallback) from a minimal valid spec. Confirm they fail first.
  - Accept: those tests pass; `pnpm --dir services/agent` and
    `pnpm --dir apps/hospitality` test, lint and typecheck pass; the PR body
    records the catalog prompt size at head (`catalog.prompt().length`,
    tokens as chars ÷ 4) next to the base figure of 29,853 chars ≈ 7,463
    tokens.
  - Blocked by: Read tools add `localTime`; GuestCards element (the prompt
    must not name an element the deployed catalog lacks)

## Milestone 5: Live verification (Verify and Ship, not Implement)

Not checkboxes, because each needs a prod deploy first (see assumptions).
Listed so every PRD success criterion has an owner:

- After PRs A–H are merged and deployed (static sites, agent-api, Pulumi
  for /gen; deploy checked at job level), run one live scenario batch and
  log it in `docs/ui-quality/chat-scenarios-*.md`: at least one chat-drawer
  question per read tool (`lookup_reservation`, `list_today_reservations`,
  `check_availability`, `search_guests`, `get_table_status`), each recorded
  as fitting or not, with the count of "Component could not be displayed"
  across the chat drawer and /gen (target 0).
- In that batch, confirm reservation rows, the slot list (including a
  closed day answered in words) and guest cards show their fields as
  visible text.
- In that batch, render one long-timestamp Timeline in /gen (F25 live) and,
  if PR A took the fix route, confirm one Generate click sends (F26 live).
- Record the catalog prompt size before and after in `verification.md`.

## Design gaps found

None. Two items depend on reproduction rather than design: F26 has a
documented fallback route in the PRD, and the Timeline visual baselines may
need a runner-side regeneration. Neither needs the Architect.

## Notes

- 2026-10-24 — PR A merged as #7467 (`380005ca7`). Fix route taken; F26 reproduced (Generate moved ~25px between mousedown and mouseup). Red evidence came from a local throwaway copy of the spec (no local E2E Auth0 credentials). The committed spec first ran in CI's Gen E2E job, which passed 15/15.
- 2026-10-24 — PR B merged as #7469 (`4150f46c4`). Node alignment compares centres, not left edges (active node is 14px, others 12px). The new stories have only the geometry test, no screenshots. Visual Regression (Storybook), which runs the geometry test, passed.
- 2026-10-24 — PR C merged as #7468 (`897ef11bc`). Added midnight and unknown-zone cases. The zone is the request's `timeZone`, i.e. the client's, as the AC states.
- 2026-10-24 — PR D merged as #7466 (`eeb5bfaf9`). `partyOf` has no plural branch, matching the dashboard ("Grupo de N" and "Groupe de N" don't change with N). `seated` is neutral because the dashboard has no tone for it. The es-MX and fr-CA list names and no-open-times line were written for this PR; the dashboard has no source for them.
- Advisory Visual Regression (hospitality, rialto-web) was red on #7466 and #7469, and on every recent main run before this run. Not caused by these PRs.
- 2026-10-25 — PR E merged as #7471 (`b2ba512e2`), PR F as #7474 (`8bb548ca7`), PR G as #7475 (`953f3b9e7`; null card and row fields no longer fall back).
- 2026-10-25 — PR H merged as #7476 (`b94061625`). Reviewer pass 9/10. Catalog prompt at head: 31,401 chars ≈ 7,850 tokens (base 29,853 ≈ 7,463).
