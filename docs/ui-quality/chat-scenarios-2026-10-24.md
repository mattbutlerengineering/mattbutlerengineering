# Hospitality chat: scenario run 2026-10-24

Live run against prod (`mattbutlerengineering.com/hospitality`, chat drawer), signed in as the Owner's own account. Every write confirm was to be cancelled; none came up, because no scenario got far enough to reach a write tool. Model calls: 8 of the 30/hr budget.

Plan and finding definitions: scenarios 1–20, findings F1–F12, from the pre-run code review.

## Scenario verdicts (batch 1)

| #   | Scenario                    | Verdict  | What happened                                                                                                                         | Findings    |
| --- | --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | "How does tonight look?"    | fail     | Asks the host for a venue ID. Rendered card shows "Component could not be displayed".                                                 | F1, F2, F13 |
| 4   | "When is the Garcia party…" | fail     | 2× `lookup_reservation` + 1× `search_guests`, all errored. Asks for venue ID and says "I don't know today's date".                    | F3, F4, F5  |
| 5   | "Book Tom for Friday"       | fail     | Asks for venue ID, start **and end** time, and the calendar date for "Friday".                                                        | F1, F5      |
| 9   | "Table 12 is clean"         | fail     | Asks for venue ID; unsure whether "clean" means AVAILABLE or READY.                                                                   | F1, F5      |
| 13  | Waitlist (capability gap)   | pass     | Says clearly it can't, and offers alternatives. Still asks for a venue ID.                                                            | F12         |
| 15  | Spanish host                | degraded | Answers in Spanish (good), but asks for "el ID del local".                                                                            | F1          |
| 17  | "Cancel every reservation…" | pass     | No unconfirmed write; promises a per-item confirm. Still blocked on venue ID and date.                                                | F1, F5      |
| 20  | Menu question               | degraded | "I don't have menu information." Menus exist in the product (eat-sheet port is live), so this is a capability gap, not a scope limit. | F12         |

Not yet run: 2, 3, 6, 7, 8, 10, 11, 12, 14, 16, 18, 19. All need venue context to say anything useful, so they wait for the P0 fix.

## New findings from the live run

| #   | Finding                                                                                                                                                                                                                                                                                   | Evidence                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| F13 | An element whose string prop goes over the catalog `charLimits` fails seam validation, and the whole element is replaced by "Component could not be displayed". Scenario 1: an Alert `title` of 89 chars against a 60-char max. The model doesn't respect the limits, so this will recur. | `rialto-catalog/src/registry.tsx` `SeamFallback`; `generated-schemas.ts:12` |
| F14 | The model calls `render_component` for plain conversational replies, so the card just repeats the text (scenario 1).                                                                                                                                                                      | NDJSON for scenario 1                                                       |
| F16 | Assistant markdown is shown raw: `**bold**` and `- ` bullets appear literally and newlines collapse into one paragraph.                                                                                                                                                                   | `ChatPanel.tsx` renders `{msg.content}` as plain text                       |
| F17 | `update_table_status` / `get_table_status` key tables by number, but tables can have only a label (this venue has six with no number), so "Table 12 is clean" cannot work.                                                                                                                | Batch 3, scenario 9                                                         |
| F18 | Every agent tool call 404'd in prod: `API_BASE_URL` carries `/api` and api-client paths are absolute, so requests went to `/api/api/v1/...`. Masked until F1 was fixed. Fixed in #7442.                                                                                                   | `curl` 404 vs 401                                                           |
| F19 | The model didn't know the table status lifecycle ("can't tell whether READY tables are free to seat") and echoed raw enums to staff. Fixed in #7446.                                                                                                                                      | Batch 4                                                                     |
| F20 | The model told staff "Reply yes to confirm", but since #7448 typing while a confirm is pending cancels it. The prompt now points staff at the Confirm and Cancel buttons.                                                                                                                 | Batch 5                                                                     |

## Confirmed live (from the pre-run list)

- **F1/F2 (no venue context):** every scenario hits it. This is the top blocker.
- **F3/F4 (broken lookups):** `search_guests` and `lookup_reservation` both error out.
- **F5 (no date or persona):** the model says "I don't know today's date" unprompted.
- **F10 (no auto-scroll):** after 8 turns, `scrollTop` is 0 with `scrollHeight` 2112 and `clientHeight` 526. The newest answer is off-screen and there's no empty state.
- **F12 (capability gaps):** waitlist and menus.

## Ranked fix list

1. **P0, venue + date context** (F1, F2, F5, F6). This one fix unblocks 17 of the 20 scenarios.
2. **P0, tool fixes** (F3, F4).
3. **P1, ChatPanel rendering:** markdown (F16), auto-scroll, empty state with starter prompts, Stop button, typing indicator (F10).
4. **P1, seam truncation** (F13): clamp over-limit strings instead of dropping the element.
5. **P1, prompt guidance:** render cards only for structured data (F14). Folds into the P0 system prompt.
6. **P2:** friendly 429 copy (F9), cancel feedback, a shared persisted conversation (F11), waitlist and menu tools (F12).

## Improvement tracking

| Date       | Change                                                                                   | Scenarios passing                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-10-24 | none, baseline                                                                           | 2 / 8 run                                                                                                   |
| 2026-10-24 | #7439 venue + date context                                                               | context sent, dates resolve; all tool calls still fail (F18)                                                |
| 2026-10-24 | #7441 ChatPanel UX, #7442 API origin, #7443 clamp                                        | 1, 4, 5, 8 (to confirm), 10 pass; F8 self-corrections on every turn; confirm bar shows raw ids              |
| 2026-10-24 | #7444 no self-correction, #7445 readable confirm + tables by name, #7446 table lifecycle | no self-corrections over 3 turns; confirm shows table names; statuses in plain words; READY → "reset first" |
| 2026-10-24 | #7447 confirm title case, #7448 cancel feedback                                          | 1, 4, 5, 8, 9, 10 pass; cancel acknowledged; F20 found                                                      |

## Batch 3 (after #7441, #7442, #7443), 2026-10-24

| #   | Scenario                 | Verdict  | Notes                                                                                                       |
| --- | ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | "How does tonight look?" | pass     | `list_today_reservations` with the venue-local date: "Nothing is booked for tonight, Saturday, October 24." |
| 10  | "Which tables are open…" | pass     | Six tables, four ready and two available. Matches the timeline.                                             |
| 4   | Garcia lookup            | pass     | Searches and correctly reports no booking.                                                                  |
| 5   | "Book Tom for Friday"    | pass     | "Friday is October 30"; asks only for party size and time.                                                  |
| 8   | Walk-in → confirm        | degraded | Reaches the confirm bar (cancelled). The bar shows `tableId: cmti2ghiw…` and "Seat Walk In".                |
| 9   | "Table 12 is clean"      | degraded | Can't work: tables have no numbers (F17).                                                                   |

The empty state shows the four starter questions, auto-scroll holds at the bottom, and no seam fallbacks appeared. Every reply opened by "correcting" the previous one (F8), and the fix ships in the PR that adds this section.

## Batch 5 (after #7444–#7448), 2026-10-24

| #      | Scenario                       | Verdict | Notes                                                                                                                                  |
| ------ | ------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 10     | "Which tables are open…"       | pass    | "Two tables are free right now… four more are clean but not yet reset." No raw enums.                                                  |
| 8      | Walk-in → confirm → cancel     | pass    | Bar reads "Seat a walk-in · Party size: 2 · Table: lml · Guest: Lee". The note shows after Cancel, and the next reply acknowledges it. |
| 9      | "Can I seat a walk-in at dsf?" | pass    | "No, not yet. dsf is clean but not reset…", which matches the reservations state machine.                                              |
| 3-turn | Self-correction check          | pass    | None of the three replies retracted an earlier one.                                                                                    |

Every write confirm was cancelled; no data was written to the venue. Remaining open items: F12 (waitlist and menu tools), F11 (drawer and `/chat` don't share a conversation), and confirm dates/times shown raw.
