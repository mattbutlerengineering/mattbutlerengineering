---
stage: architect
run: feature:gen-ui-elements-2
date: 2026-10-24
assumptions:
  - "No live interview: this is an autorun stage. Every trade-off below was decided by the Architect from autorun-brief.md, idea.md, prd.md, ux.md and the code. The brief leaves build-or-compose to this stage, so that call is the Architect's, not the Owner's. None of these decisions was confirmed with the Owner."
  - "Build or compose: three new display-only rialto components (ReservationList, TimeSlots, GuestCards), each built from existing rialto parts (Badge, Tag), plus a catalog meta each. The other two shapes lost. Model-side composition costs about five elements per row and gives no locale-correct counts and no row dropping. Catalog-only composites would need a second metadata source next to ADR-013's single CatalogSource."
  - "Words come from two places. Counts (party size, visits), status words, risk words, Walk-in and the empty-list line come from rialto's locale dictionary (ADR-028), keyed off the raw tool value the model copies. Names, display times, the date line and tags are written by the model. In-element words therefore follow the app's locale, while the model's sentence follows the language the user typed. The two differ only when staff type in a language other than their app locale, which is accepted."
  - "Tool output change, not in the brief: the three reservation and slot read tools add a venue-local 24-hour `localTime` (HH:mm) beside each ISO time. The API returns ISO timestamps, and the model would otherwise do time-zone arithmetic to write 7:30 PM. Staff would see a wrong arrival time if it got that wrong. This is a small, reversible change to services/agent's tool results only. No API or data-model change."
  - "Changeset bump: patch. The brief says rialto source changes need a patch changeset, and packages/rialto/CLAUDE.md says every pre-1.0 release is a patch, even for new components."
  - "No ADR. The one candidate is putting hospitality display components and their status words in rialto. It fails the hard-to-reverse test while rialto stays unpublished (RIALTO_PACKAGES_TOKEN is unset), and TapeChart already set the precedent. Revisit if rialto is published with these components."
  - "Protocol vs repo: the protocol says an unattended ADR carries status `provisional`, but this repo's ADR checker (tools/cli/src/commands/adr-structural.ts, VALID_STATUSES) accepts only active, superseded and deprecated. A provisional ADR would fail check-adr. No ADR was written, so nothing broke here, but a later stage that writes one must resolve the mismatch."
  - "F26: this design takes ux.md's hypothesis (the hints line unmounting on blur) as the leading cause. Batch 7e reproduced F26 with Playwright fill. Implement must reproduce it in a failing e2e test before changing PromptBar. If that test cannot go red, the PRD's documented not-reproducible route applies."
---

# Architecture: Fitting chat elements for reservations, availability and guests (wave 2)

## Approach

Each new data shape gets one **rialto display component with a co-located
`*.catalog.ts`**, using the same path every wave-1 element took (ADR-013).
The components are `ReservationList`, `TimeSlots` and `GuestCards`. The
generator turns each catalog file into a Zod schema and a catalog
description. The registry seam then validates and clamps each element
(`withSchemaValidation`), and a small adapter maps it to the component.
Inside rialto, each component is built from parts that already exist (Badge
for status and risk, Tag for times and guest tags), so no new visual
vocabulary is needed. The two kinds of words are kept apart:

- **Deterministic words** come from rialto's typed locale dictionary
  (ADR-028), so they are plural-correct and match the dashboard: party size,
  visit count, status, risk, Walk-in, and "no open times".
- **Data words** are written by the model in the user's language: names,
  display times, the date line and tags.

The model only copies raw values (`CONFIRMED`, `trusted`, `4`), which it does
reliably, and the component turns them into words.

Nested row fields are tolerant, as wave-1 Timeline's are: they are optional
in the schema, and the adapter drops an incomplete row, so one bad row never
replaces the whole element with the fallback. The chat prompt gets one
mapping line per shape, pinned by a test.

The read tools add a venue-local `HH:mm` beside each ISO time, so the model
never does time-zone arithmetic. F25 becomes a shared timestamp column in
Timeline using CSS subgrid. F26 becomes a PromptBar whose height does not
depend on focus.

Two other shapes were compared and lost:

- **Model-side composition** of Card, Stack, Text and Badge. Batch 7e showed
  it renders a single guest. It loses on output size (about five elements
  per reservation row), on fallbacks (any one missing word is a fallback,
  with no way to drop the row) and on locale-correct counts.
- **Catalog-only composite elements** living in rialto-catalog. These avoid
  touching rialto, but they need a second metadata source and generator
  path next to ADR-013's single CatalogSource, and the adapter would have to
  read the locale context itself.

## Components

### `ReservationList` (new, `packages/rialto/src/components/ReservationList/`)

- Responsibility: show bookings as aligned rows: time, guest (or the
  localized Walk-in), localized party size, and the status word in its tone.
  It turns a raw status value into a localized word and a Badge tone, and
  shows an unknown status verbatim in neutral. Display-only: a `<ul>`
  labelled by the locale message, with no focusable or hoverable parts.
- Collaborators: `Badge`, `useRialtoLocale()`; the catalog adapter.

### `TimeSlots` (new, `packages/rialto/src/components/TimeSlots/`)

- Responsibility: show the date line ("{date} · {partyOf(n)}") and the open
  times as static Tag-look labels that wrap. With no times it shows one
  localized "no open times" line, never an empty box.
- Collaborators: `Tag`, `useRialtoLocale()`; the catalog adapter.

### `GuestCards` (new, `packages/rialto/src/components/GuestCards/`)

- Responsibility: show one stacked card per guest: the name in the display
  face, the localized visit count and risk word (risk Badge tone) on one
  line, then a row of Tags that is left out when there are no tags. Never
  shows contact details, notes or spend. No boxes inside boxes: cards are
  separated by spacing.
- Collaborators: `Badge`, `Tag`, `useRialtoLocale()`; the catalog adapter.

### Rialto locale dictionary (changed, `packages/rialto/src/i18n/`)

- Responsibility: owns every word the three components produce. New keys go
  in `RialtoMessages` with a value in every locale module (en-US inline,
  en-GB, es-MX, fr-CA):
  - `partyOf(n)`: "Party of 4" / "4 personas" style text;
  - `visitCount(n)`: plural per locale;
  - `reservationStatus`: pending, confirmed, cancelled, completed, noShow,
    seated;
  - `guestRisk`: trusted, standard, risky;
  - `walkIn`;
  - `noOpenTimes`;
  - accessible list names `reservations`, `openTimes`, `guests`.
- Collaborators: the three components. The **dashboard's app catalogs**
  (`timeline.status.*`, `crm.risk.*`, `home.reservations.walkIn`) own the
  vocabulary. Rialto's copy is pinned to them by a drift test (see Data
  model).

### Status and risk normalizer (inside rialto, next to the components)

- Responsibility: a pure function from any string to `{ key | undefined,
tone }`. It trims, upper-cases, and maps spaces and hyphens to `_`, so
  `"No show"`, `"no-show"` and `"NO_SHOW"` all resolve. An unknown value
  gives no key and a neutral tone, and the caller then shows the raw string.
  The tone table is copied from the dashboard: pending is warning; confirmed
  is success; cancelled and no-show are error; completed and anything
  unknown are neutral. For risk: risky is error, standard is warning,
  trusted is neutral.
- Collaborators: `ReservationList`, `GuestCards`. One module, so the rule
  lives in one place.

### Catalog metas (new, one `*.catalog.ts` per component)

- Responsibility: the model-facing contract: description, explicit
  `propSchemas` (nested arrays need them, because the generator skips `[]`
  types) and top-level `charLimits` only. Descriptions contain no inner
  double quotes, and each names its required fields in words.
- Collaborators: `packages/rialto-catalog/scripts/generate-catalog.ts`,
  which emits `generated-schemas.ts` and `generated-catalog.ts`.

### Registry adapters (changed, `packages/rialto-catalog/src/registry.tsx`)

- Responsibility: three humble adapters, following the Timeline pattern:
  - drop a row missing a required field;
  - coerce `partySize` and `visits` from a numeric string (a NaN drops the
    row);
  - render `SeamFallback` only when **no** row is usable.

  `TimeSlots` is the exception to the last rule: it drops blank times and
  falls back only when the date line is missing.

- Collaborators: `withSchemaValidation` / `withAliasNormalization` seam,
  `SeamFallback`, the rialto components.

### Timeline (changed, F25, `packages/rialto/src/components/Timeline/`)

- Responsibility, unchanged: a time-ordered sequence. Layout changes:
  - `.timeline` becomes a grid with the columns
    `fit-content(33%) auto 1fr`;
  - each `.item` spans all columns with `grid-template-columns: subgrid`,
    so every row shares one timestamp column;
  - `.timestamp` gets `min-width: 64px` (48px when compact) and loses
    `white-space: nowrap`, gaining `overflow-wrap: anywhere`.

  Items keep their own element boxes, so `role="listitem"` is unaffected.
  Subgrid was chosen over `display: contents`, which drops the box that
  carries the role. The catalog description drops "tonight's reservations
  in arrival order" and keeps "a guest's visit history".

- Collaborators: none new.

### PromptBar (changed, F26, `apps/gen/src/components/PromptBar.tsx`)

- Responsibility, unchanged: one click on Generate sends the prompt.
  Changes:
  - the hints line is **always mounted**;
  - it is shown through CSS (`.bar:focus-within .hints { visibility:
visible }`, hidden otherwise);
  - the `isFocused` state and the `onFocus`/`onBlur` handlers are deleted.

  The bar's height no longer depends on focus, so the button cannot move
  between mousedown and mouseup.

- Collaborators: `PlaygroundPage` (unchanged).

### Agent read tools (changed, `services/agent/src/routes/gen-agent-tools.ts`)

- Responsibility: `lookup_reservation` and `list_today_reservations` add
  `localTime` (venue `HH:mm`, from `startTime` in the request's `timeZone`,
  UTC when there is none) to each reservation. `check_availability` adds
  `localTime` to each slot. Everything else stays the same; the change is
  additive.
- Collaborators: `todayIn`'s existing `Intl.DateTimeFormat` approach; the
  model.

### Chat prompt guidance (changed, `services/agent/src/routes/gen-agent-prompt.ts`)

- Responsibility: replace the single "Pick the element…" line with one line
  per shape, in ux.md's table:
  - **reservations to ReservationList:** arrival order; time from
    `localTime`; the raw `status` copied; leave out cancelled and no-show
    rows for "tonight" questions;
  - **open slots to TimeSlots:** open times only; a closed or fully booked
    day answered in words, never as this element;
  - **guests to GuestCards:** at most five, then say how many more matched;
  - **visit history to Timeline**;
  - table statuses to StatusLED, counts to Stat, tags to Tag, other lists
    to Table.

  Timeline is no longer named for a night's bookings.

- Collaborators: `buildAgentSystemPrompt`, `gen-agent-prompt.test.ts`.

## Data model

There are no persistent entities and no migrations. The access patterns are
three one-shot reads per chat turn: tool result, then model, then element
spec, then render. The only consistency rule is that one render is
internally consistent. The element props are the data model:

```ts
// ReservationList — what the model fills
{ reservations: Array<{
    time?: string;            // display text the model writes from localTime, e.g. "7:30 PM"
    guest?: string;           // name; absent/blank → messages.walkIn (row kept)
    partySize?: number | string; // coerced; non-numeric → row dropped
    status?: string;          // raw value copied from the tool, e.g. "CONFIRMED"; any string
  }> }                        // row dropped unless time, partySize, status present

// TimeSlots
{ date: string;               // required, display text, charLimit 40 (clamped)
  partySize: number | string; // required
  times: string[] }           // required array (empty allowed → noOpenTimes line); blanks dropped

// GuestCards
{ guests: Array<{
    name?: string; visits?: number | string; risk?: string; tags?: string[];
  }> }                        // card dropped unless name, visits, risk present; tags optional data
```

Owned invariants:

- **The dashboard owns the status and risk vocabulary.** The rialto locale
  modules hold a copy. A new hospitality test
  (`apps/hospitality/src/i18n/chat-element-vocabulary.test.ts`) asserts, for
  each of the four locales, that `rialto/locales/<tag>`'s
  `reservationStatus`, `guestRisk` and `walkIn` equal the app catalog's
  `timeline.status.*`, `crm.risk.*` and `home.reservations.walkIn`. A
  second copy that drifts then fails the test instead of the dashboard and
  the chat disagreeing.
- **Wave-1 schema rules**:
  - no `.max()` on any nested string;
  - every enum-like nested field is `z.string()`;
  - the words the model must fill are required at the top level (`date`,
    `partySize`, `times`, and each list array);
  - row-level words are enforced by the adapter's drop rule, because a
    required nested field would drop the whole element (F13).

  Pinned in `registry-full.test.tsx` and by a meta-level test that walks
  each new `propSchemas` string for `.max(` and `z.enum(`.

## Interfaces & contracts

### Catalog element → registry seam → component (in-process)

- Input: a json-render element `{ type: "ReservationList" | "TimeSlots" |
"GuestCards", props }` from the model, streamed by the agent (chat) or by
  `/api/gen/ui` (/gen).
- Output: the rialto component, or `SeamFallback` ("Component could not be
  displayed"). The fallback appears **only** when:
  - a top-level required prop is missing or of the wrong type; or
  - zero rows survive the drop rule (`ReservationList`, `GuestCards`); or
  - the date line is missing (`TimeSlots`).
- Failure modes:
  - A bad row disappears silently. This trades a missing row for zero
    whole-element fallbacks, per ux.md assumption 4; Review should weigh it.
  - An over-long top-level string is clamped with "…", never dropped.
  - An unknown status or risk shows its raw word in neutral.
  - Nothing here crosses a network seam, so there is no timeout. Rendering
    is synchronous and has no side effects.

### Agent read-tool result (process seam: agent → model)

- Input: the existing tool inputs (unchanged).
- Output: the existing fields plus `localTime: "HH:mm"` on each reservation
  and slot.
- Failure modes:
  - An unparseable ISO time leaves `localTime` out; it does not throw.
  - API errors keep their existing `{ error }` replies.
  - The upstream API calls keep their existing timeouts and the existing
    retry policy: none on reads. A retry by the model re-runs a read, which
    is safe.

### Chat system prompt (agent → model)

- Input: `AgentPromptContext` (unchanged).
- Output: the prompt string, with one mapping line per shape; the catalog
  prompt is still appended last.
- Failure modes: the model may still answer in prose. That is the run's
  riskiest piece, and the live batch measures it; no code can enforce it.
  The idea's kill test names the next lever: the prompt, or tool output.

### Catalog prompt size (measurement, not code)

- Method: `catalog.prompt().length`, with tokens estimated as characters ÷ 4. This is the same method behind the brief's ~7.4k and #7456's commit
  message. Measured at this branch's base: **29,853 chars ≈ 7,463 tokens**.
  Verify re-runs it at head and records both numbers. The expected growth
  is about 1,800–2,400 chars (about 450–600 tokens) for three entries, less
  the shorter Timeline description.
- No ceiling is enforced. The brief sets none, and the PRD leaves the
  ceiling to the Owner.

## Stack & dependencies

- No new dependencies. Everything uses rialto, json-render 0.21, Zod and
  Intl, all already in use.
- CSS subgrid is used for F25. It is supported in every evergreen browser
  since 2023, and rialto targets evergreen browsers.

## Decisions & alternatives

- **New rialto components with catalog metas**, over model-side composition
  of Card, Stack, Text and Badge. Composition costs about five elements per
  row, cannot drop a bad row, and cannot localize counts.
- The same choice, over catalog-only composites in rialto-catalog. Those
  need a second metadata source and generator path beside ADR-013.
- **Deterministic words from rialto's locale dictionary, keyed off raw tool
  values**, over model-written status and count words. Model words
  disagree with the dashboard, and a colour needs a key anyway.
- **List elements with row dropping** (`GuestCards` holds `guests[]`), over
  one element per guest stacked by the model. One element per guest turns a
  single bad card into a visible fallback, against ux.md's error state.
- **Row-level words optional in the schema and enforced by the adapter**,
  over required nested fields. Nested validation is all-or-nothing, so one
  missing word would drop the whole list (F13).
- **`localTime` in the tool result**, over the model converting ISO UTC to
  venue time. Time-zone arithmetic is where a model shows staff a wrong
  arrival time.
- `localTime` as language-neutral `HH:mm`, over a pre-formatted "7:30 PM".
  The server does not know the user's language; the model only restyles it.
- **Timeline subgrid shared column**, over moving long timestamps above the
  title. The ux chose one layout for the whole list.
- Subgrid, over `display: contents`. Contents drops the box carrying
  `role="listitem"`.
- **PromptBar hints always mounted and hidden by CSS**, over keeping them
  focus-gated and anchoring the button. Anchoring treats the symptom; this
  removes the height change, and it deletes code.
- **F25 regression check is a real-layout test**: a Storybook
  `LongTimestamps` story, plus a Playwright geometry assertion in
  `packages/rialto/src/test/visual/visual.spec.ts`. The assertion is that
  every timestamp's right edge is at or left of its node's left edge, and
  that all nodes share one x. This was chosen over a jsdom test, which
  cannot measure layout (the "CSS false-pass" class). The rialto visual
  workflow is advisory, not `CI Gate`, which is accepted.
- **F26 regression test is in `apps/gen/e2e/playground.spec.ts`**: `fill`,
  then one `click`, then expect exactly one recorded `POST /api/gen/ui`
  through `gen-api-mocks`, plus the Generate button's bounding box equal
  before and after blur. A jsdom unit test pins the structure ("the hints
  element is mounted while unfocused"). This was chosen over a unit test
  alone, which cannot see the button move. `gen-e2e` runs in `e2e.yml` on
  `apps/gen/**` changes.
- **Names `ReservationList`, `TimeSlots`, `GuestCards`**, over
  `GuestSummary` and `OpenTimes`. They match the words the prompt already
  uses ("lists of reservations… time slots"). Hospitality's local
  `dashboard/ReservationList` and `crm/GuestCard` never import alongside
  them.

**Accepted behaviour changes**, found by comparing the old and new rules
over the inputs where they differ:

- **Timeline**:
  - When every timestamp fits in 64px (48px compact), the output is
    identical, including timestamp-less events, which keep an empty
    64px column.
  - When any timestamp is wider, the shared column widens for **every**
    row, so short-timestamp rows' dots move right with it. This is
    accepted; it is what keeps the dots in one line.
  - A timestamp wider than a third of the Timeline wraps, and a single
    unbreakable token may break mid-word. This is accepted.
  - In a Timeline narrower than about 192px, the 64px minimum beats the
    33% cap. This is accepted.
- **PromptBar**:
  - The unfocused bar is now as tall as the focused one (about 20px taller
    than before), so the preview area is about 20px shorter. This is
    accepted.
  - The hints now also show while the Generate or New button has keyboard
    focus. Before, they showed only while the textarea did. This is
    accepted.
- **Prompt mapping**: a night's bookings move from Timeline to
  ReservationList. Timeline keeps visit history. Table keeps every other
  list.

**Generated-artifact and release obligations** (from
`.claude/rules/gotchas.md`):

- Regenerate `generated-schemas.ts` and `generated-catalog.ts` with
  `pnpm --filter @mbe/rialto-catalog generate`.
- `pnpm --dir packages/rialto build` regenerates `registry.json`, the
  manifest and the `exports` map for the three new folders.
- `llms.txt` and `llms-full.txt` (root, rialto, rialto-catalog,
  services/agent) are regenerated at commit by
  `precommit-llms-stage.mjs`. Build the CLI first.
- Add an a11y-matrix fixture for each new barrel export.
- Add per-family locale tests for es-MX and fr-CA.
- Add a `.changeset/*.md` patch entry for rialto. No npm publish.

**PRD traceability**:

| PRD criterion                    | Owning component(s)                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| One live batch, all read tools   | Prompt guidance, the three components, existing StatusLED; measured in Verify                                  |
| Zero fallbacks                   | Registry adapters' row-drop rule; tolerant schemas                                                             |
| Reservation fields visible       | `ReservationList` + locale dictionary + `localTime`                                                            |
| Slot list visible / empty day    | `TimeSlots` (`noOpenTimes`), prompt guidance (closed day in words)                                             |
| Guest card fields visible        | `GuestCards` + locale dictionary                                                                               |
| Prompt guidance present + pinned | `gen-agent-prompt.ts` + `gen-agent-prompt.test.ts` (one assertion per shape)                                   |
| Prompt size recorded             | Catalog prompt size measurement (base 29,853 chars ≈ 7,463 tokens)                                             |
| F25 fixed                        | Timeline subgrid + `LongTimestamps` story + geometry test + patch changeset; live /gen render in batch         |
| F26 closed                       | PromptBar always-mounted hints + e2e single-click test, or the documented not-reproducible route               |
| Wave-1 constraints hold          | Catalog metas + meta-level schema test (`.max(`/`z.enum(` scan) + description quote check (existing generator) |

## ADRs

None. No decision met the bar. The closest is "hospitality display
components and their status words live in rialto". It is surprising, and it
was a real trade-off, but it is not hard to reverse while rialto stays
unpublished in this run, and TapeChart already set the precedent.
Revisit it as an ADR if rialto is published with these components.
