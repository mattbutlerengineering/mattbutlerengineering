---
stage: operate
run: feature:gen-ui-elements-2
date: 2026-11-18
users-observed: 1
signal-source: "the Owner's own live scenario batches 10-13 in docs/ui-quality/chat-scenarios-2026-10-24.md; no staff or other users exist, so the count is the Owner alone"
assumptions:
  - "users-observed is 1, not 0: the brief says '0 beyond the Owner is the honest count', read as the Owner being the one observed person. That person is the builder, not the target (front-of-house staff), so every signal below is anecdote or unobserved, never pattern or adoption."
  - "The brief's wait of 1 day is read as satisfied: release.md records released-at 2026-10-25, batches 10-13 ran 2026-11-17 and 2026-11-18, and Operate runs on 2026-11-18."
  - "The harvest window is the last 25 days (--days 25), which covers both session clusters of this run (2026-10-24/25 and 2026-11-17/18)."
  - "The llms-files merge conflict and the skipped hospitality deploy are taken from the orchestrator's hand-off and from release.md/review.md; the conflict itself was not re-derived from git history, only the removal commit (aa613237c, #9057) was confirmed."
  - "No tracker issues were filed, per the brief. Open debt below is therefore carried in this file and in docs/backlog.md only."
---

# Retro: Fitting chat elements for reservations, availability and guests (wave 2)

## Outcomes vs. intent

Population: one person observed, the Owner, on their own demo venue. The success sentence ("every chat read tool's data renders in a fitting element with 0 'Component could not be displayed'") is a statement about rendering, so the Owner's own live batches can measure it directly. They cannot say anything about whether staff find the elements easier to scan than prose: that outcome is `unobserved`.

### Success sentence: every chat read tool renders in a fitting element with 0 fallbacks, in one batch

- What happened: batch 10 (2026-11-17) exercised all five read tools (10.1 to 10.5) plus es-MX, fr-CA and /gen: the fallback count was 0 in chat and on /gen across all 8 calls. But rendering was not clean: in 5 of 7 chat turns the model's call text appeared as plain reply text (`ReservationList(…)`, `TimeSlots(…)`, `StatusLED(…)`), and in 3 of those (10.5, 10.6, 10.7) no element rendered at all (F36). After the F36 fix (#9059), batch 11 re-asked six questions and all rendered elements with 0 fallbacks and no raw call text. Batch 13 (after the last fix) re-ran only the reservation shapes.
- Signal strength: anecdote. One person, one run per question; batch 11 itself says intermittent recurrence is not ruled out. No single batch has had all five tools clean in one go: batch 10 was 0 fallbacks but F36-degraded, and batch 11 re-asked `list_today_reservations`, `check_availability`, `get_table_status` (three of the five tools) plus a `lookup_reservation` case (11.8, degraded by F38).
- Verdict: met on the letter in batch 10 (0 fallbacks, all five tools). Fitting rendering for all five tools exists only across batches combined: four tools in batches 11 to 13, `search_guests` in batch 10 only.

### The five items Verify left open, mapped to batch evidence

| Open item (verification.md)            | Batch evidence                                                                                                                                                                                                                                        | Status                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Five tools at 0 fallbacks in one batch | Batch 10: all five tools asked, fallback count 0 (chat and /gen), but F36 left 3 turns with no element. Batch 11: three tools clean, 0 fallbacks.                                                                                                     | Met on fallback count; clean rendering only across batches 10 to 13 combined. Anecdote.                                   |
| Guest-card tags live                   | Batch 10.4: Hannah Dickinson card with a "VIP" tag, no email, phone or notes. /gen tags are model-written, so they test the Tag element, not guest data.                                                                                              | Met for one tag. Multi-tag wrapping on the real card stays unverified.                                                    |
| `data-rialto-seam-dropped` marker live | Batches 10 and 11: marker count 0 after every turn.                                                                                                                                                                                                   | Not exercised. 0 shows no drop occurred, not that the drop path works live. Unit tests only.                              |
| es-MX and fr-CA live                   | Batch 10.6 and 10.7 failed on F36 (raw 24-hour text, no element). Batch 11.6 (es-MX list) and 11.7 (fr-CA slots, "9 h 00" chips) passed after #9059. Batches 12.3 and 13.3 (es-MX multi-date: "3 nov, 9:15 p.m.", "Grupo de 2", "Confirmada") passed. | Met for ReservationList and TimeSlots in both locales. GuestCards and StatusLED in fr-CA, and es-MX TimeSlots, not asked. |
| Multi-date lookup                      | Batch 10.2: prose, no element (F37). Batch 11.8: element, but raw ISO dates (F38). Batch 12.1: element, dates missing in English. Batches 13.1 and 13.2: 2 and 5 rows, every row dated ("Nov 3, 9:15 PM"); 13.3 es-MX dated.                          | Met after two post-ship fixes (#9087, #9093).                                                                             |

### F25 (Timeline timestamps over the dot) and F26 (Generate first click)

- What happened: both were verified fixed live during Verify (batch 8) and stayed fixed in batch 10's /gen run: one Generate click made exactly one `POST /api/gen/ui` (200), and the Timeline rendered three events with dates. Batch 10 did not use long timestamps, so F25 was not re-stressed.
- Signal strength: anecdote.

### Whether the model picks the right element unprompted (the PRD's biggest unknown)

- What happened: mixed. When it called the tool it picked the right element for reservations, slots, guests and tables. But `lookup_reservation` with four bookings was answered as prose in batch 10 (10.2) and as an element in batches 11 to 13; the model also chose prose or raw call text on a prompt that the regressions below show was under-specified.
- Signal strength: anecdote (one person, one run per question, model output is intermittent).

## Regressions found after ship, and fixed

Three defects reached prod after the run's own Verify and Review passes, all found by the Owner's live batches and all fixed within a day:

- **F36, raw element-call text as the reply (#9059, merged 2026-11-18):** the chat prompt listed components as `- Name: { props }` with no example, so the model sometimes wrote the component as a function call. Fix: one prompt line saying names are element types never written with parentheses, plus one `render_component` example, pinned by a test in `gen-agent-prompt.test.ts`. The PR says no chat prompt, catalog or runner code changed between batch 9 and batch 10 except #8787 and #8791 (an env-switched Gemini on the gen routes), so a provider switch in prod is a suspect that is not verifiable from the repo. Batch 11 confirms the fix live; the cause is still unconfirmed.
- **F38, raw ISO date-times in the date cell (#9087):** #7538 told the model to write date plus time as the row time; the model copied the tool's `2026-10-16 09:26`, and `displayClockTime` only formatted a bare `HH:mm`. Fix: `displayClockTime` also recognises `YYYY-MM-DD HH:mm` and the ISO `T` form. Batch 12 confirmed it for es-MX only.
- **Multi-date date loss (#9093):** batch 12.1 (English) showed five time-only rows, indistinguishable across days. The model composed date plus time from a prompt instruction only intermittently. Fix: the tool now sets `localTime` to `YYYY-MM-DD HH:mm` when rows span more than one date, and the element localises it. Batch 13 (2 and 5 rows, en-US and es-MX) showed 0 of 9 rows missing a date. This is the same defect review.md ranked as a major and "fixed" in #7538 by prompt wording: the prompt-only fix did not hold.

## Open debt

The run's own findings; never counted as feedback.

- F31, Timeline connector is a short stub under each dot, not a line to the next event (cosmetic; verification.md, "Not verified").
- F34, zero-padded "09:00 AM" chips when the model converts `localTime` itself (verification.md). Not re-observed in batches 10 and 11, where chips read "9:00 AM".
- F35, the model restates its pre-tool sentence after a tool call (verification.md). Not re-checked in batches 10 to 13.
- F39, stray literal "[ReservationList elements show here]" in the reply (batches 12.1 and 12.3). Not reproduced in 4 of 4 replies in batch 13; batch 13 says keep open until a few more batches stay clean.
- Raw ISO dates in the model's own prose above the element ("2026-11-03 at 21:15", batches 13.1 to 13.3). The element is correct; the model text is not, and nothing in the element or tool controls it.
- New, not logged as a finding: the element's row order follows the tool result and is not sorted by date (13.2 starts on Oct 26, then Nov 3, then Oct 16).
- F12 (waitlist and menu tools), out of scope per the brief.
- Carried from review.md, none filed as issues (the brief forbids tracker interaction):
  - NO_SHOW wording: `reservations.status.NO_SHOW` and `timeline.status.NO_SHOW` still differ, and es-MX still reads "No se presentó" on the Reservations page (`apps/hospitality/src/i18n/catalogs/es-MX.json:995`); the tone tables in `booking-vocabulary.ts` remain unpinned by a test.
  - rialto public-API ADR is still unwritten and rialto is still unpublished (`RIALTO_PACKAGES_TOKEN` unset).
  - `gen` is still absent from the deploy-closure guard: `scripts/__tests__/deploy-static-app-paths.test.mjs` has no `gen` reference.
  - Dead exports: `VocabularyTone` is still exported from `packages/rialto/src/components/booking-vocabulary.ts:4`. `localTimeIn` is no longer dead: it is exported from `services/agent/src/routes/gen-tool-support.ts:27` and now imported by `gen-agent-briefing-tools.ts`, so drop it from this item.
  - Review suspicions never settled: es-MX "10:30 p. m." and dated rows may wrap in the 4.5rem time column; `TimeSlots.times` is not nullish-tolerant; `toPartySize` accepts 0, negatives and fractions; a venue with no `ianaTimezone` shows UTC as venue time.

## Run retrospective

- Keep: the Owner's live scenario batches as the measurement. They found F28, F29, F30, F33 before ship and F36, F38 and the multi-date loss after ship, each within hours, and each batch is logged with the exact question, so every fix could be re-checked against the same words. The per-defect fix PRs with a red-first test also earned their keep: every post-ship regression was closed the same day.
- Keep: Review's cross-PR pass. It named the multi-date major and the catalog-description-versus-code mismatch (the cause of F34) before ship.
- Change: when a fix depends on the model doing something (write a date, copy a field), prefer moving the work into the tool or the element and pin it, as #9093 and #7533 did. #7538 fixed the multi-date major by prompt wording and it held only intermittently; it took #9087 and #9093 to finish it.
- Change: Verify carried "all five tools at 0 fallbacks in one batch" as an open item across a month. The first batch that ran it (batch 10) found three failed turns in a state Verify's batches had never seen. A live single-batch check should run before Ship, not after.
- Change: model and provider changes in prod (#8787 and #8791 switched the gen routes to an env-switched Gemini) can regress prompt-dependent output with no repo diff in the chat path. F36 may have come from that; the run has no record that would confirm it.
- Stop: nothing proposed. The one stage worth questioning is Ship's "pre-flight a month later": it re-ran a precheck on a branch with docs only and skipped two lanes (knip, size), so it added little.

## Environment

| Mistake                                                                                               | Evidence                                                                                           | Class      | Proposed carrier                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw element-call text reached users (F36); 3 of 7 turns showed no element                             | batch 10 table, rows 10.1 to 10.7; #9059                                                           | mechanical | A post-deploy chat probe that fails when a reply contains `Name(` for a catalog component. The existing `Post-Deploy Check` Playwright smoke is the carrier to extend; whether it covers chat element output was not checked. |
| Catalog descriptions showed a sample string ("7:30 PM") the model imitated (F34)                      | `review.md` major 2                                                                                | mechanical | Extend `packages/rialto-catalog` `chat-element-catalog-metas.test.ts` to fail when a time-bearing prop description carries a formatted example.                                                                               |
| A model-dependent fix for multi-date rows did not hold (date loss in batch 12.1)                      | `review.md` major 1; batch 12.1; #9093                                                             | judgement  | A line in `services/agent/CLAUDE.md`: data the tool can supply is set by the tool, not requested from the model in the prompt.                                                                                                |
| `Deploy Hospitality` silently skipped a merge (path-filter gap on #7487)                              | `verification.md` §Failures                                                                        | mechanical | The deploy-closure guard from #7489 (`scripts/__tests__/deploy-static-app-paths.test.mjs`): add `gen`, as review.md already listed, so the same gap cannot recur for the /gen app.                                            |
| E2E and visual checks are advisory, so UI regressions in prod are found by hand, not by a red gate    | `CLAUDE.md` gotchas, CI section: `CI Gate` is the only required check, E2E and visual are advisory | mechanical | Already known and by design; the carrier is batch-style live verification (a scheduled `/site-audit`), not a gate change. No new carrier proposed.                                                                            |
| `llms*.txt` files were removed mid-run (#9057, aa613237c) and caused a merge conflict in run branches | orchestrator hand-off; removal commit confirmed on main                                            | judgement  | None needed beyond the removal itself: the tooling and the files are both gone, so the conflict class cannot recur. Recorded as a lesson: an in-flight run is not told about a repo-wide generated-file removal.              |
| Verify's open item (five tools in one batch) sat for a month; only Operate ran it                     | `verification.md` §Not verified; `release.md` §Post-release checks                                 | judgement  | A Ship pre-flight line in the repo's pipeline hooks table (CLAUDE.md § Pipeline Stage Hooks): carry-forward live checks run before Ship, not after.                                                                           |

## Knowledge-base harvest

Ran `python3 /Users/mbutler/.claude/plugins/cache/skills/idea-to-prod/0.27.0/kb.py harvest /Users/mbutler/github/mattbutlerengineering --days 25` (main checkout root, 1055 transcripts scanned, 519 failure-to-fix arcs, 0 skipped lines).

- Result: zero findings for this run. No arc in the run's two session windows (2026-10-24/25, 2026-11-17/18) traces to a gen-ui-elements-2 failure; the arcs that matched on keywords are other runs' availability and agent-tool work (for example the 2026-10-31 closure and briefing tools).
- The recurring errors across all sessions (325 and 224 occurrences of the worktree-isolation Bash classifier rejecting compound and git commands, `File has not been read yet`, zsh `status` and `====` eval errors) are already covered by `gotchas.md` ("Worktree-isolated subagents' Bash is gated by an isolation classifier", "Shell (zsh)"). Nothing new to propose.
- Proposed `gotchas.md` entries for human review: none.

## Idea seeds

Appended to `docs/backlog.md` as one-line seeds. No tracker issues were filed.

- Add a post-deploy live chat probe that asks each read tool one question and fails on `Name(` text, a missing element or a `Component could not be displayed` count above 0.
- Pin the catalog descriptions against sample strings that models copy back (time words, date formats).
- Sort ReservationList rows by date and time when they span several dates.
- Reconcile `reservations.status.NO_SHOW` with `timeline.status.NO_SHOW` in es-MX and fr-CA and pin the booking-vocabulary tone tables.
- Write the rialto public-API ADR before the first publish, add `gen` to the deploy-closure guard, and drop the `VocabularyTone` export.
- Stop the model from writing raw ISO date-times in its prose above a ReservationList.
- Check whether a chat-prompt regression can be tied to a model or provider switch (the F36 suspect), and make the provider visible in the scenario log.
- Fix F31, F34 and F35 together (Timeline connector, zero-padded chips, restated pre-tool sentence) once F39 stays clean for a few more batches.

## Run complete

2026-11-18. The run met its success sentence on the Owner's own live batches (anecdote, one person), with three post-ship regressions found and fixed (#9059, #9087, #9093), and the findings and follow-ups above carried as seeds. No staff user has used the elements; real adoption is unobserved. Seeds above are the input to the next Idea-stage run.
