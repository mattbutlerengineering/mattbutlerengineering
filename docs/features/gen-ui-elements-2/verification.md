---
stage: verify
run: feature:gen-ui-elements-2
date: 2026-10-25
assumptions:
  - "Zero fallbacks is judged across batch 8 (all five tools) and batch 9 (re-run after the fixes), not one single batch; a full five-tool batch at 0 is left to Operate's live batch."
  - "Guest-card tags are verified by unit test only: prod's one directory guest has no tags."
---

# Verification: Fitting chat elements for reservations, availability and guests (wave 2)

## Summary

10 PRD criteria: **8 PASS, 2 PASS with a stated gap (partly NOT RUN live), 0 FAIL**. Two parts of criteria were **not verified live**:

- **Zero fallbacks:** batch 8 asked every read tool but showed 1 fallback (F28). That was fixed in #7487, and batch 9 re-ran the affected questions at 0. No single batch has yet covered all five tools at 0.
- **Guest card fields visible:** tags were only unit-tested, because the one prod guest has none.

Live testing also found and fixed four defects outside the breakdown: F28 (#7487), F29 (#7491), F30 (#7533) and F33 (#7492). The deploy-filter gap that silently skipped #7487 is fixed in #7489. Verdict: the run meets its PRD, with those two gaps carried to Operate's live batch.

Evidence sources:

- Live batches 8 and 9 in `docs/ui-quality/chat-scenarios-2026-10-24.md` (#7479, #7535).
- Test runs on `origin/main` at `464215cad`, in the bootstrapped `.claude/worktrees/f29`.

## Criteria & evidence

### One live batch, all read tools fitting

- Check: batch 8 in prod chat, one or more questions per read tool, each logged.
- Evidence (batch 8 table, `chat-scenarios-2026-10-24.md`):
  ```
  8.2 list_today_reservations "…for Friday, October 16." — First live ReservationList: one row "09:26 · Matt Butler · Party of 2 · Confirmed"
  8.3 lookup_reservation "Look up Matt Butler's reservation." — One past booking, in words (a list of one is not needed)
  8.4 get_table_status "…status of every table at a glance." — Six StatusLEDs with their words visible
  8.6 check_availability "Which days this week are we open?…" — First live TimeSlots: header "Monday, Oct 26 · Party of 2" and 47 open-time chips
  8.8 search_guests "Search guests named Hannah." — First live GuestCards: name, "0 visits · Trusted"
  ```
- Result: PASS. `lookup_reservation` returned a single booking, which the model correctly answered in words rather than as a one-row list.

### Zero fallbacks

- Check: count `[data-rialto-seam-fallback]` in the chat log and on /gen for each scenario.
- Evidence:
  ```
  batch 8: "Component could not be displayed" count: chat 1 (F28), /gen 0.
  batch 9 (after #7487, #7491, #7492, #7533): 9.1 fallbacks 0, 9.3 fallbacks 0, 9.4 fallbacks 0, 9.5 fallbacks 0. Fallback count: chat 0.
  ```
- Result: PASS with a gap. The fallback seen in batch 8 is fixed and gone live. A single batch covering all five tools at 0 was not run (see Not verified).

### Reservation fields visible

- Check: inspect the rendered row's visible text (innerText, not aria).
- Evidence (batch 9.5, live, after #7533):
  ```
  { "time": "9:26 AM", "rowText": "9:26 AM\nMatt Butler\nParty of 2\nConfirmed", "fallbacks": 0 }
  ```
- Result: PASS

### Slot list visible

- Check: visible chips for an open day; a closed day answered in words.
- Evidence:
  ```
  8.5 "What times are open for 4 people this Friday?" — "The venue is closed this Friday, October 30, so nothing can be booked for 4 people that day." (no element)
  8.6 / 9.4 — 47 TimeSlots chips, each a visible label ("9:00 AM" … "8:30 PM" after #7533)
  TimeSlots.test.tsx ✓ shows the localized no-open-times line for an empty times array, never an empty box
  ```
- Result: PASS

### Guest card fields visible

- Check: live card text, plus the component test for tags.
- Evidence:
  ```
  8.8 live: "Hannah Dickinson\n\n0 visits\n·\nTrusted" (no email, phone or notes shown)
  GuestCards.test.tsx ✓ shows tags in a wrapping row and leaves the row out when there are none
  GuestCards.test.tsx ✓ never renders email, phone, notes or spend, even when given them
  ```
- Result: PASS with a gap. Name, visits and risk were verified live. Tags were verified by test only.

### Prompt guidance present

- Check: `services/agent/src/routes/gen-agent-prompt.test.ts` on `origin/main`.
- Evidence:
  ```
  ✓ maps each data shape to the element that shows it > reservations from list_today_reservations or lookup_reservation as ReservationList
  ✓ … > open slots from check_availability as TimeSlots, never for a closed or full day
  ✓ … > guests from search_guests as GuestCards, at most five, without private details
  ✓ … > a guest's visit history as Timeline
  ✓ … > table statuses from get_table_status as StatusLED
  ✓ … > headline counts as Stat, tags as Tag, other lists as Table
  ✓ … > never maps a night's bookings to Timeline
  ```
- Result: PASS

### Prompt size recorded

- Check: `catalog.prompt().length`, tokens taken as chars ÷ 4.
- Evidence:
  ```
  base (before this run):            29,853 chars ≈ 7,463 tokens
  after PR H (#7476):                31,401 chars ≈ 7,850 tokens
  chat now sends (after #7492):      15,845 chars ≈ 3,961 tokens  (component list only; /gen still uses the full 31,401)
  ```
- Result: PASS

### F25 fixed

- Check: the real-layout geometry test, the live /gen render and the changeset.
- Evidence:
  ```
  packages/rialto/src/test/visual/visual.spec.ts — "Timeline geometry / data-display-timeline--long-timestamps(-compact)":
    expect(row.textRight, `timestamp "${row.text}" ends at …, past its node at …`).toBeLessThanOrEqual(row.nodeLeft)
  #7469 checks: Visual Regression (Storybook)	pass	2m26s
  .changeset/timeline-timestamp-column.md (in #7469)
  batch 8 /gen: "Long timestamps wrap in their own column, clear of the dots (F25 fixed live)."
  ```
- Result: PASS

### F26 closed

- Check: the reproduction and regression test from #7467, plus a live single click.
- Evidence:
  ```
  breakdown note: "F26 reproduced (Generate moved ~25px between mousedown and mouseup)"; #7467 adds apps/gen/e2e/playground.spec.ts and PromptBar.test.tsx cases
  apps/gen vitest: Tests 479 passed (479)
  batch 8 /gen: "One Generate click sent exactly one /api/gen/ui request (F26 fixed live)."
  ```
- Result: PASS

### Wave-1 constraints hold

- Check: `chat-element-catalog-metas.test.ts` and the element tests on `origin/main`.
- Evidence:
  ```
  ✓ ReservationList catalog meta > reservations carries no .max( and no z.enum(
  ✓ ReservationList catalog meta > keeps every top-level prop schema required
  ✓ ReservationList catalog meta > has no inner double quotes in its description
  ✓ TimeSlots catalog meta > partySize / times carries no .max( and no z.enum(   (+ required, no inner quotes)
  ✓ GuestCards catalog meta > guests carries no .max( and no z.enum(             (+ required, no inner quotes)
  ✓ ReservationList / GuestCards … has nothing focusable  (display-only)
  ✓ shows an unknown status verbatim in neutral / an unknown risk verbatim in neutral
  Test Files 6 passed (6) · Tests 80 passed (80)
  ```
- Result: PASS

## Failures

None open. The live failures found during this stage were routed and fixed before the stage closed:

- F28: a word-less label Text fell back. Fixed in #7487.
- F33: the model wrote raw JSONL patches as reply text, because the chat was sent the /gen generator spec. Fixed in #7492.
- F29: pre-tool and post-tool text ran together. Fixed in #7491.
- F30: times were shown in 24-hour format to en-US hosts. Fixed in #7533.
- Deploy Hospitality skipped #7487 because of a gap in the per-app path filter. Fixed in #7489, and confirmed on a real push in batch 9.5.

## Not verified

- **A single live batch covering all five read tools at 0 fallbacks.** Batch 9 re-ran only the affected questions. Operate's minimum signal is one live batch, so that batch should re-ask all five tools.
- **Guest-card tags live.** Prod's only directory guest has no tags.
- **The #7487 drop path live.** In batch 9 the model sent no word-less label, so the hidden `data-rialto-seam-dropped` marker never appeared live. Unit tests cover it.
- **es-MX and fr-CA live.** The locale clock (#7533) and locale words were tested in jsdom only; no live batch ran in another language.
- **Open findings, not in this run's scope:** F31 (Timeline connector stub), F32 (suspected table misread), F34 (zero-padded "09:00 AM" chips), F35 (post-tool restatement), F12.
