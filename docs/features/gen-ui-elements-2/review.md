---
stage: review
run: feature:gen-ui-elements-2
date: 2026-10-25
assumptions:
  - "The review was run by one fresh, read-only reviewer agent over the merged diff on origin/main (464215cad); the Owner arbitrated the two majors in session."
  - "adr_status.py reports every repo ADR as 'unrecognized' (the repo writes its own status word), so live ADRs were taken from the raw status lines: ADR-004 and ADR-006 superseded, the rest active."
---

# Review: Fitting chat elements for reservations, availability and guests (wave 2)

## Scope

The run's 13 merged PRs, read as full diffs (llms\*.txt, generated-\* and registry.json filtered out) and in their final state on `origin/main` at `464215cad`:

- **Planned items A–H:** #7466, #7467, #7468, #7469, #7471, #7474, #7475, #7476.
- **Fixes found in live testing:** #7487 (word-less leaf Text/Badge dropped), #7489 (deploy-static closure), #7491 (step paragraph break), #7492 (chat gets only the component list), #7533 (locale clock).

The run artifacts (`architecture.md`, `breakdown.md`, `ux.md`, `prd.md`, `verification.md`) and the scenario log were read against the code. Each PR had already passed its own reviewer and CI Gate; this pass is the cross-PR view.

## Findings

### Major: a ReservationList built from a multi-date `lookup_reservation` shows no dates

- Scenario: "When is the Garcia party coming?" returns bookings on Oct 16 and Nov 2, both at 19:30. `localTime` is `HH:mm` only and `ReservationListRow` has no date, so the chat shows two identical "7:30 PM · Garcia · Party of 4 · Confirmed" rows. Staff read the wrong day. Neither ux.md Flow 2 nor the architecture considered results spanning several dates. Live batch 8.3 missed it because the guest had only one booking.
- Standard: none (no `docs/standards.json` in this repo).
- Decision: **fixed in #7538.** The prompt says that when rows span more than one date, the model writes each row's date and time together as its time, in the user's language. `displayClockTime` passes that text through unchanged. Owner: "Fix both now".

### Major: the prompt and the catalog descriptions disagree on who writes time words (cause of F34)

- Scenario: after #7533 the element formats a bare `HH:mm`, but the ReservationList and TimeSlots descriptions still showed "display text such as 7:30 PM". The model got `localTime: "09:00"`, imitated the example and sent "09:00 AM", which fails `CLOCK_TIME` and renders zero-padded. This was seen live in batch 9.4.
- Standard: none.
- Decision: **fixed in #7538.** Both descriptions say to copy `localTime` as is (HH:mm), with the element writing it in the locale's clock. The generated catalog is regenerated and a patch changeset is added.

### Minor: the vocabulary drift test pins one of two dashboard vocabularies, and the tone tables are unpinned

- Scenario: `chat-element-vocabulary.test.ts` pins `timeline.status.*`, but the Reservations page renders `reservations.status.*`. For NO_SHOW they differ: es-MX "No asistió" vs "No se presentó", and fr-CA "Absent" vs "Absence". An es-MX host sees two words for one booking. The tone tables in `booking-vocabulary.ts` are hand copies of `STATUS_BADGE_VARIANT` and `getRiskVariant`, with no test pinning them.
- Standard: none.
- Decision: deferred. The two app vocabularies disagreeing is a pre-existing app inconsistency, not something this run introduced, and reconciling them is a translation decision for the Owner. Seeded as a wave-3 follow-up (see Hand-off).

### Minor: live-fix design deviations are not recorded in the run's design record

- Scenario:
  - #7492 changes the chat-prompt contract: only a marker-sliced component list is sent, where the architecture says "the catalog prompt is still appended last".
  - #7487 adds a third seam outcome, a hidden `data-rialto-seam-dropped` marker.
  - #7533 moves time formatting from the model to the component.
  - None passes the ADR test, since each is easy to reverse. But they appear only as fixed failures in `verification.md`, not in breakdown.md's Notes.
  - The architecture's deferred ADR ("revisit if rialto is published with these components") also has no carrier. rialto 0.8.x has `publishConfig` set; publishing is held back only by an unset token. Once it publishes, the new required `RialtoMessages` keys become public API under a patch changeset.
- Standard: none.
- Decision: **fixed in this stage** for the record. Notes lines are added to `breakdown.md` in this commit. The ADR trigger is carried in the Hand-off below and in the Ship stage's pre-flight. Revisit it before rialto is published.

### Minor: two dead exports

- Scenario: the `localTimeIn` export (`services/agent/src/routes/gen-agent-tools.ts:51`) has only in-file references. The `VocabularyTone` export (`packages/rialto/src/components/booking-vocabulary.ts:4`) has one internal use and is not in the barrel. Both widen the public surface with no consumer. (cut-list: dead export)
- Standard: none.
- Decision: deferred. Harmless and a one-word change each; not worth another PR and deploy cycle. Bundle it into the next PR that touches either file.

## Passes with no findings

- **Security: clean.**
  - GuestCards renders only name, visits, risk and tags. The adapter whitelists those fields, and a test proves email, phone, notes and spend never render.
  - The new elements are display-only, text-escaped and non-focusable, and writes stay behind Confirm, so the prompt-injection surface is not widened.
  - Inputs are validated at the seam.
  - Pre-existing, not new: the full Guest object still reaches the model through `search_guests`.
- **ADR compliance: clean.**
  - ADR-013: co-located `*.catalog.ts`, generator path, hand-written adapters.
  - ADR-028: keys in `RialtoMessages`, every locale provided, words via `useRialtoLocale`.
  - ADR-001: CSS Modules and tokens only.
  - ADR-014: deploy topology unchanged in kind.
  - The other active ADRs are out of the diff's reach.
- **Correctness:** clean apart from the two majors above.
- **Complexity:** clean apart from the two dead exports. The components are thin, the adapters follow the Timeline pattern, and nothing is speculative.
- **Design:** the deviations minor above; otherwise matches architecture.md.
- **Domain passes:** none selected. The `package.json` changes are a size-limit raise and an exports entry, with no dependency or lockfile change, and no payments or migrations paths are touched.

Suspicions with no concrete scenario yet, carried for Operate rather than ranked:

- The es-MX "10:30 p. m." may crowd ReservationList's 4.5rem time column. A dated "Fri Oct 16, 7:30 PM" from #7538 will wrap in it.
- `TimeSlots.times` is not nullish, so a `null` entry would fall back the whole element.
- `toPartySize` accepts 0, negatives and fractions.
- `/gen` deploys omit `packages/api-client` and `packages/sentry` from pulumi-up's paths. It is covered only through the static `workflow_run` chain, and #7489's guard test excludes `gen`.
- A venue with no `ianaTimezone` gets UTC presented as venue time.
- F31's connector stub looks pre-existing.

## Verdict

**Ready to ship once #7538 merges** with a reviewer pass and a green CI Gate. There are no critical findings and no ADR violations. Both majors are fixed in #7538. Of the three minors, one was fixed in this stage (the Notes record) and two were deferred with the reasons above. All five review passes ran, and no domain pass was selected. Operate's live batch must still cover what Verify left NOT RUN live:

- all five read tools at 0 fallbacks in one batch;
- guest-card tags;
- the drop marker;
- es-MX and fr-CA;
- a multi-date lookup, from #7538.

## Hand-off

Next stage: Ship.

Follow-ups to seed, not fixed in this run:

- reconcile `reservations.status.NO_SHOW` with `timeline.status.NO_SHOW` in es-MX and fr-CA, and pin the tone tables;
- write the rialto public-API ADR before rialto is first published;
- add `gen` to the deploy closure guard;
- drop the two dead exports.
