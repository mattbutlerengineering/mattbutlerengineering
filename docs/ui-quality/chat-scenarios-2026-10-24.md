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

| #   | Finding                                                                                                                                                                                                                                                                                                                                              | Evidence                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| F13 | An element whose string prop goes over the catalog `charLimits` fails seam validation, and the whole element is replaced by "Component could not be displayed". Scenario 1: an Alert `title` of 89 chars against a 60-char max. The model doesn't respect the limits, so this will recur.                                                            | `rialto-catalog/src/registry.tsx` `SeamFallback`; `generated-schemas.ts:12`              |
| F14 | The model calls `render_component` for plain conversational replies, so the card just repeats the text (scenario 1).                                                                                                                                                                                                                                 | NDJSON for scenario 1                                                                    |
| F16 | Assistant markdown is shown raw: `**bold**` and `- ` bullets appear literally and newlines collapse into one paragraph.                                                                                                                                                                                                                              | `ChatPanel.tsx` renders `{msg.content}` as plain text                                    |
| F17 | `update_table_status` / `get_table_status` key tables by number, but tables can have only a label (this venue has six with no number), so "Table 12 is clean" cannot work.                                                                                                                                                                           | Batch 3, scenario 9                                                                      |
| F18 | Every agent tool call 404'd in prod: `API_BASE_URL` carries `/api` and api-client paths are absolute, so requests went to `/api/api/v1/...`. Masked until F1 was fixed. Fixed in #7442.                                                                                                                                                              | `curl` 404 vs 401                                                                        |
| F19 | The model didn't know the table status lifecycle ("can't tell whether READY tables are free to seat") and echoed raw enums to staff. Fixed in #7446.                                                                                                                                                                                                 | Batch 4                                                                                  |
| F20 | The model told staff "Reply yes to confirm", but since #7448 typing while a confirm is pending cancels it. The prompt now points staff at the Confirm and Cancel buttons.                                                                                                                                                                            | Batch 5                                                                                  |
| F21 | `check_availability` returns `[]` both for a fully booked day and a closed one. This venue has hours only on Monday, so "2 people next Thursday" got "no openings at any time" when the honest answer is "you're closed Thursdays". The tool now says when the day is closed.                                                                        | Batch 6; `GET /availability` → `[]`, venue `operatingHours` = `{monday}`                 |
| F22 | The `/chat` page's breadcrumb and document title read "Details" rather than "Chat".                                                                                                                                                                                                                                                                  | Batch 6                                                                                  |
| F23 | A generated StatusLED shows only a coloured dot: its label is an `aria-label`, so a table-status list read as six unnamed dots. The catalog adapter now shows the label as text beside the light.                                                                                                                                                    | Batch 7 screenshot                                                                       |
| F24 | Generated Text and Badge had no prop for their words, and their adapters rendered only child elements, so every generated label came out empty. Tag had a `children` string but nothing pointed the model at `label`, so all four Tags in a /gen guest profile fell back. Text gets `text`, Badge gets `label`, and Tag's description names `label`. | /gen run, batch 7c                                                                       |
| F25 | Timeline timestamps longer than the label column (e.g. "March 3, 2025") overlap the event dot. Cosmetic; rialto Timeline styling.                                                                                                                                                                                                                    | /gen run, batch 7c                                                                       |
| F26 | On /gen, the first Generate click after the prompt is filled sends no request; a second click works. Reproduced in batch 7e: after Playwright `fill`, one click left the network log with only the `GET /api/gen/specs`, and the second click sent `POST /api/gen/ui`. Not yet tried with real keystrokes.                                           | /gen runs, batches 7c, 7d and 7e                                                         |
| F27 | In the /gen JSON inspector, the "Search JSON" box overlaps the Copy button (it renders as "Sea" over "Copy").                                                                                                                                                                                                                                        | /gen screenshot, batch 7e                                                                |
| F28 | In the chat, the model can still emit a `variant: "label"` Text with no words as a heading above a ReservationList (batch 8, Oct 16 bookings). Words are required since #7462, so the seam shows "Component could not be displayed" above an otherwise correct list.                                                                                 | batch 8 stream: `{"id":"title","type":"Text","props":{"variant":"label"},"children":[]}` |
| F29 | Two assistant text parts are joined with no space: "…open times for 2 people:Monday's slots run…".                                                                                                                                                                                                                                                   | batch 8 screenshot                                                                       |
| F30 | Chat elements show 24-hour times ("09:00", "20:30") to an en-US host, both in TimeSlots chips and ReservationList rows. `localTime` is `HH:mm`; nothing formats it for the locale.                                                                                                                                                                   | batch 8                                                                                  |
| F31 | Timeline's connector between event dots is a short stub under each dot, not a line that reaches the next event. Cosmetic.                                                                                                                                                                                                                            | /gen screenshot, batch 8                                                                 |
| F32 | Suspected: answering "status of every table", the model listed a table as "Matt Butler: seated", then corrected itself unprompted on the next turn ("it's the unnamed table, and its status is ready"). Needs the `get_table_status` payload to tell a data quirk from a misread.                                                                    | batch 8                                                                                  |

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

| Date       | Change                                                                                               | Scenarios passing                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-10-24 | none, baseline                                                                                       | 2 / 8 run                                                                                                   |
| 2026-10-24 | #7439 venue + date context                                                                           | context sent, dates resolve; all tool calls still fail (F18)                                                |
| 2026-10-24 | #7441 ChatPanel UX, #7442 API origin, #7443 clamp                                                    | 1, 4, 5, 8 (to confirm), 10 pass; F8 self-corrections on every turn; confirm bar shows raw ids              |
| 2026-10-24 | #7444 no self-correction, #7445 readable confirm + tables by name, #7446 table lifecycle             | no self-corrections over 3 turns; confirm shows table names; statuses in plain words; READY → "reset first" |
| 2026-10-24 | #7447 confirm title case, #7448 cancel feedback                                                      | 1, 4, 5, 8, 9, 10 pass; cancel acknowledged; F20 found                                                      |
| 2026-10-24 | #7449 Confirm-button wording                                                                         | 8 says "Press Confirm"; typed reply cancels cleanly; F21, F22 found                                         |
| 2026-10-24 | #7450 readable confirm dates, #7452 closed days, #7453 Chat title, #7456 Stat/Timeline/Tag/StatusLED | title reads "Chat"; table status renders as StatusLEDs with 0 fallbacks; F23 found                          |

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

## Batch 6 (after #7449), 2026-10-24

| #   | Scenario                                  | Verdict  | Notes                                                                                                                                          |
| --- | ----------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | Walk-in for 3 → confirm                   | pass     | "Press Confirm in the chat to seat them, or Cancel to drop it." Offers a second free table. F20 fixed.                                         |
| 8b  | Type a new request while confirm pending  | pass     | "Cancelled. Nothing was changed." appears and the new request runs.                                                                            |
| 5b  | "Book the Nguyens, 5, next Thursday 7:30" | degraded | Resolves "next Thursday" to October 29 correctly, then reports no openings without saying why (F21: the venue is closed every day but Monday). |
| 5c  | "Make it 2 people instead, same time"     | degraded | Keeps the date across turns, same F21 answer.                                                                                                  |

The create-reservation confirm bar (#7450's readable dates) could not be reached live: the venue has no bookable day but Monday. Every write confirm was cancelled.

## Batch 7 (after #7450–#7456), 2026-10-24

| #   | Scenario                             | Verdict  | Notes                                                                                                                                                                                            |
| --- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —   | `/chat` page title                   | pass     | Tab and breadcrumb read "Chat" (F22 fixed).                                                                                                                                                      |
| 10  | "Which tables are open right now?"   | pass     | Plain-text answer, no component: right for a two-line answer.                                                                                                                                    |
| 10b | "Show me the status of every table…" | degraded | The model renders six StatusLEDs (first live use of a #7456 element), 0 seam fallbacks, labels like "dsf (4 seats): ready, needs reset", but only as aria-labels: six bare dots on screen (F23). |

No writes were proposed.

## Batch 7b and 7c (after #7458), 2026-10-24

| #    | Scenario                                                      | Verdict  | Notes                                                                                                                                          |
| ---- | ------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 10b  | "Show me the status of every table at a glance."              | pass     | Six StatusLEDs, each with its name beside it ("dsf: 4 seats, clean, ready to reset"). F23 fixed.                                               |
| 1b   | "Give me tonight's numbers: total tables, free, reservations" | pass     | Three Stats in a row: 6, 2, 0. First live Stat.                                                                                                |
| /gen | Guest profile with tags and a visit timeline                  | degraded | The model picks Tag and Timeline unprompted. Timeline renders (F25 cosmetic); all four Tags and both Text labels are empty or fall back (F24). |

## Batch 7d (after #7460), 2026-10-24

| #    | Scenario                                                   | Verdict  | Notes                                                                                                                                                                                                                                                                                        |
| ---- | ---------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| /gen | Guest profile: heading, tags, status badge, visit timeline | degraded | All four Tags now show their words. The model still left the optional Text and Badge words out (it filled Tag's required ones), and one Timeline event came back as `{"key":"x"}`, failing the whole Timeline. Text and Badge words are now required, and an event with no title is dropped. |

## Batch 7e (after #7462), 2026-10-24

Checked once agent-api run 40159868855's `Deploy API Services` job succeeded. The prompt was reworded slightly ("a heading with her name") so the spec cache could not replay batch 7d.

| #    | Scenario                                                   | Verdict | Notes                                                                                                                                                                                                                                                                                                                                       |
| ---- | ---------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| /gen | Guest profile: heading, tags, status badge, visit timeline | pass    | 12 elements, 6 types, 0 seam fallbacks. Every word is visible: a display Text "Maria Garcia", a Badge "Confirmed" (the model used `children`, which renders), four Tags, a "Last 3 visits" label and a three-event Timeline. F24 is fixed live. F25 is still visible (timestamps such as "March 14, 2025" overlap the dot). F26 reproduced. |

## Batch 8 (after #7466–#7476, wave 2), 2026-10-25

Checked once agent-api run 40172193499's `Deploy API Services` job succeeded for `b94061625` (#7476). Static Sites and Pulumi for the same SHA also succeeded. The prod venue has one directory guest and one past reservation (Oct 16), and none tonight, so the scenarios below lean on those.

| #    | Tool                      | Question                                                 | Verdict  | Notes                                                                                                                                                                                                        |
| ---- | ------------------------- | -------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 8.1  | `list_today_reservations` | "Show me tonight's reservations."                        | pass     | No bookings tonight; answered in words with the date, no element.                                                                                                                                            |
| 8.2  | `list_today_reservations` | "Show me the reservations for Friday, October 16."       | degraded | First live ReservationList: one row "09:26 · Matt Butler · Party of 2 · Confirmed", status copied raw and shown as a success Badge. A wordless label Text above it fell back (F28). Times are 24-hour (F30). |
| 8.3  | `lookup_reservation`      | "Look up Matt Butler's reservation."                     | pass     | One past booking, in words (a list of one is not needed). Notes it is not tonight's. Self-corrects batch 8.4's table claim (F32).                                                                            |
| 8.4  | `get_table_status`        | "Show me the status of every table at a glance."         | pass     | Six StatusLEDs with their words visible. See F32.                                                                                                                                                            |
| 8.5  | `check_availability`      | "What times are open for 4 people this Friday?"          | pass     | Closed day answered in words ("The venue is closed this Friday, October 30"), no TimeSlots.                                                                                                                  |
| 8.6  | `check_availability`      | "Which days this week are we open? Show the open times…" | pass     | First live TimeSlots: header "Monday, Oct 26 · Party of 2" and 47 open-time chips. Text parts run together (F29); 24-hour chips (F30).                                                                       |
| 8.7  | `search_guests`           | "Find our regular guests." / "…named Garcia." / "…Matt"  | pass     | No matches, correctly: the directory holds one guest. Says search is by name, email or phone, not tag.                                                                                                       |
| 8.8  | `search_guests`           | "Search guests named Hannah."                            | pass     | First live GuestCards: name, "0 visits · Trusted"; no email, phone or notes shown.                                                                                                                           |
| /gen | —                         | Visit history with long timestamps                       | pass     | 3 elements, 0 fallbacks. One Generate click sent exactly one `/api/gen/ui` request (F26 fixed live). Long timestamps wrap in their own column, clear of the dots (F25 fixed live). Connector stub, F31.      |

"Component could not be displayed" count: chat 1 (F28), /gen 0. Target was 0, so F28 is the one open blocker for wave 2's success criterion. All five read tools reached their fitting element or, where the data called for it, words.
