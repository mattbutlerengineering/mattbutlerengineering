---
stage: idea
run: feature:venue-availability
date: 2026-10-24
prior-art: feature:venue-hours-services (branch feature/venue-hours-services, verify failed 2026-09-26, unmerged)
---

# Idea: Venue availability configuration

> Origin: a direct request, not a backlog seed. The work-in-flight check found the unmerged `feature/venue-hours-services` run, which covers part of this work. The Owner decided this run is its successor: that branch is prior art, and its tested pieces may be salvaged (see "Prior art").

## Problem

A manager can only say "open 09:00–22:00 on Mondays". With hours that coarse they can't:

- run lunch and dinner as separate services;
- close for Christmas, a renovation, or a snowstorm;
- open late on a Saturday;
- cap covers at 7:30pm;
- leave turnover time between reservations;
- make the patio bookable only at certain times;
- book out a private event space;
- run a ticketed wine dinner;
- require prepayment for New Year's Eve;
- set a cancellation policy.

So the widget offers times the venue can't serve. The manager patches it by phone or by blocking tables by hand. When they do close, guests who already booked are never told, and arrive to a locked door. Setting up the same thing day after day is tedious even where the system allows it.

What the repo shows on `main` today:

- one open/close window per weekday, with no overnight service;
- no shifts, overrides, closures or seasons;
- pacing uses only its first rule, and turn times are global;
- no buffer between bookings;
- sections are ignored, and every table is bookable online;
- deposits are venue-wide and ignore party size, with no way to edit the policy;
- the server doesn't enforce hours or maximum party size;
- staff can cancel one booking at a time, with a generic cancellation email;
- seed venues offer zero slots.

## Who has it

Every venue that takes reservations; no single size. Every scenario has to work across this whole range:

- **Small.** A 40-seat neighbourhood bistro: one room, owner-run, dinner only five nights a week, closed for holidays. Setup has to take minutes.
- **Large.** A 250-seat multi-room venue (main dining, bar, seasonal patio, private dining room) serving brunch, lunch, dinner and late. A GM and hosts run it. It does buyouts, holiday prix-fixe with prepayment, and ticketed events.
- **Group.** An operator with several venues who wants to reuse one configuration and holiday calendar across them.
- **Edge shapes.** A bar or late-night venue whose service crosses midnight. A tasting menu with fixed seatings. A counter or communal-table venue. A seasonal venue that closes for winter.

How they cope today:

- set hours too wide or too narrow;
- take overflow by phone;
- block tables by hand;
- explain policies out loud;
- call every guest themselves when they close;
- accept bookings they then have to call to move.

## Why now

- **It blocks real venues.** Almost no restaurant runs one window a day, so a real venue can't credibly onboard.
- **It's the foundation for the backlog.** Big Table, Open Door (ticketed seatings), Second Chance (deposits and waitlist backfill), Choose Your Table and Dress Rehearsal all assume shifts, areas, events or policies exist.
- **Generative UI exposes it.** The gen-UI booking surface (TimeSlots element, #7474) will show guests whatever availability says.
- **Domain expertise.** Matt knows this space from SevenRooms.
- **It's stalled.** An earlier, narrower attempt (`venue-hours-services`) stopped at Verify a month ago and is drifting further from main.

## Evidence

- **Anecdote.** Matt's experience working on a restaurant reservations platform.
- **Market, from vendor help centres (partly search excerpts, not fetched pages).**
  - Every platform checked ships shifts, a weekly template, date overrides, and policies per shift or rule as table stakes. Checked: Resy, OpenTable, Tock, Toast, SevenRooms, ResDiary, Eat App, TableCheck.
  - Toast, ResDiary and Eat App block by channel (online, in-house, waitlist) and by area, shift or slot.
  - Toast and Resy model ticketed events by capacity rather than tables.
  - Tripleseat runs private events as inquiry → proposal → contract → deposit → BEO.
- **Gaps observed in the market.** No vendor documents bulk-cancelling or notifying existing bookings when a venue closes, and blackouts leave those bookings intact. Diners in forums report arriving at closed venues. OpenTable kept selling tables for a restaurant after it had closed (Mistura, 2020). No vendor documents yearly repeats for holidays that move (Easter, Mother's Day, Thanksgiving, Lunar New Year). Toast's special dates don't update Google hours.
- **Demand.** Mother's Day is the busiest dining holiday, then Valentine's, Father's Day, NYE and Easter (per NRA research as quoted by Scripps). Holiday menus run as prix-fixe in one or two fixed seatings with prepayment and strict cancellation. Tock advises putting holiday booking live four to seven weeks ahead.
- **Repo.** The hospitality manager audit (E1) named seasonal and holiday hours. Seed venues are unbookable. Bookings outside hours are accepted through the API.
- **Community (last30days, 2026-09-25 to 10-25).** Silence. No on-topic operator discussion on Reddit, Hacker News or GitHub, and X wasn't enabled. Recorded as silence, not as a finding against the problem.
- **Gap.** No real-venue evidence. No restaurant has used this product's availability setup.

## Prior art

`feature/venue-hours-services` (branch and worktree, verify **failed** 2026-09-26, unmerged, about 975 commits behind main at 2026-10-24) already built:

- several named service windows per weekday;
- past-midnight windows that belong to the day they started on;
- one-off date overrides (closed, or replacement windows, plus a guest note);
- validation shared by the UI and the API;
- a server guard rejecting guest bookings outside the windows;
- closed dates and notes in the booking widget;
- an open sign that reads overrides;
- a count of reservations on a newly closed date;
- DST-correct civil-date arithmetic;
- a normalizer for both legacy hours shapes;
- a seed fix;
- a draft ADR-027 ("a reservation's date is its service day").

It deliberately left out: per-service turn times, pacing and party size; online holdback; recurring holidays; and notifying or cancelling guests on closure. Overrides are versioned JSON inside `operating_hours`, capped at 100. Architect decides which modules to salvage. That JSON shape is not assumed to be the target, because extensibility is a requirement here. Scenarios below marked **[PA]** have a working implementation in that branch.

## Ambition rung

Chosen: Showstopper, in the user's words: "configuring venue availability … make it easy to share availability configuration between different days"
Not taken: Solid: shifts, templates, overrides, closures, events, areas, pacing, turn times and policies, enforced on the server, without the live preview; Moonshot: self-tuning availability that learns from real turn times and no-shows, proposes overrides, and cascades across a venue group (seeded)
Demo: pass — while editing, a calendar shows the exact guest-bookable times for any date and flags existing bookings the change would strand
Removes a step: pass — no more test bookings or a second widget tab to check what guests will see, and no more working out who is affected by a closure
Only this product: pass — built on the venue's own reservations, floor plan and live slot engine
Achievable: pass — the riskiest piece is computing slots for an unsaved draft over about 30 days fast enough to feel live; a two-day spike can prove it

## The demo

Before: the manager closes 24 December, saves, opens the widget in another tab to check, and never learns that 14 parties are already booked that night until they arrive.

After: the manager marks 24 December closed. The calendar beside the editor immediately greys out the date in the guest preview and shows "14 reservations (52 guests) are booked on this date". One action cancels them with a closure-specific message, refunds deposits, and offers each guest the nearest open dates.

## Riskiest piece + spike

The riskiest piece is evaluating guest-visible availability for a draft (unsaved) configuration over a range of dates, against real reservations and holds, fast enough to refresh as the manager edits. Today `generateTimeSlots` reads the saved venue and runs IO for each date.

Spike (about two days): factor slot generation so it accepts an in-memory configuration. Run it over 30 days for a seeded 250-seat venue. The target is under 1s, including the list of stranded reservations.

## Cheapest kill test

Put a paper or Figma mock of the shift, template, override and closure editors in front of one real operator. Failing that, Matt plays a bistro owner and then a multi-room GM. Have them configure a real venue's week, a year of holidays, a wine dinner and an emergency snow closure, from scratch. If it takes more than 15 minutes, or they can't predict what guests will see, the interaction model is wrong before any code exists.

## Solution hunch

A hunch, not a design. Architect owns the model.

- **Layers, most general first:**
  1. venue defaults;
  2. **schedule templates** (named shift sets: "Weeknight", "Weekend brunch", "Holiday prix-fixe", "Summer");
  3. **weekly assignment**, with optional effective date ranges;
  4. **date overrides** (closed, special hours, a different template, partial or area closures);
  5. **events** (ticketed, private or buyout) layered on top of or replacing service;
  6. **night-of changes**.

  The more specific layer wins. The UI always says which layer a value came from.

- **Each shift carries:** window, last seating, interval, turn times by party size, buffer, pacing (per interval and per shift, covers and parties), party-size limits, which areas and tables are bookable on which channel (online, phone only, walk-in reserve), and a policy.
- **Reuse is the core.** Templates applied to days and date ranges. Copy a day. Reuse last year's holiday setup. A holiday calendar whose moving dates are computed each year. Edits that ask how far they reach.
- **Policies** are named, reusable rules attached to shifts, areas, overrides or events. Charging depends on Stripe being live in prod, which is a separate open item.
- **Closures handle the people affected,** not just the slots: count, list, bulk cancel or move with closure-specific messaging, refunds, rebooking suggestions, and later waitlist backfill.
- **Extensible model (requirement).** New rule types (ticketing, combined tables, group inheritance, external listing sync) must not force another schema rewrite. Today's untyped JSON blobs, and the prior run's capped JSON overrides, are the cautionary examples.
- **Simple interface (requirement).** The bistro owner sees one schedule and a handful of fields. Depth appears only when the venue turns it on. The live preview is how a manager understands what the configuration does.

## Scenario catalogue (input to PRD user stories)

Actors: **Manager** (owner or GM who configures), **Host** (floor staff working today), **Guest** (booking through the widget, gen-UI or phone), **Group Operator** (several venues), **System** (slot engine, enforcement, notifications). **[PA]** means the prior-art branch implements it.

### A. Basic week

1. A bistro owner sets dinner 17:00–22:00 Tue–Sat, closed Sun–Mon, in under 5 minutes. [PA: windows]
2. Same hours every weekday, set once and applied to all five.
3. Later hours Fri–Sat, made by copying the weekday and changing one field.
4. Last seating separate from close (kitchen closes 22:00, last booking 21:15). [PA: venue-wide buffer only]
5. Slot interval per venue or per shift: 15, 30, or fixed seatings.
6. A venue with no configuration shows a clear "not taking online bookings" state, never an empty picker.

### B. Several services a day

7. Lunch 11:30–14:30 and dinner 17:30–22:30, with nothing bookable in between. [PA]
8. Brunch at weekends only, lunch on weekdays only, dinner every day.
9. Happy hour or bar service is walk-in only and never bookable online.
10. Late service crossing midnight belongs to the service day it started on. [PA]
11. Back-to-back shifts (lunch until 15:00, tea from 15:00) without double-counting tables.
12. Fixed seatings (a tasting menu at 18:00 and 20:45), each with its own party-size range.

### C. Reusing configuration across days

13. Save a set of shifts as a named template and assign it to Mon–Thu.
14. Edit the template once and every day using it updates; the preview shows the effect.
15. Copy Tuesday to Wed–Thu in one action.
16. A seasonal template (summer patio, 1 June – 15 Sept) layered over the normal week, reverting automatically.
17. One date uses another day's template ("use Sunday's schedule on Memorial Day").
18. Edit a reused value and choose how far it reaches: this date, this date and later, or the whole template.
19. A week and month calendar shows which template each day uses.
20. Duplicate a template to make a variant ("Weeknight – short staffed").

### D. Holidays

21. Close all day on a holiday (Christmas). [PA: one-off]
22. Close one service only (no lunch on 24 December). [PA: replacement windows]
23. Special hours on one date (NYE 18:00–01:00). [PA]
24. A recurring fixed-date holiday entered once ("closed every 25 December").
25. A moving holiday computed for each year (Easter, Mother's Day, Father's Day, Thanksgiving, Lunar New Year, Diwali), not a fixed date.
26. A holiday calendar for the venue's country or region, with observed-date shifts (holiday on a Sunday, observed Monday).
27. Plan a year of holidays in one sitting: pick from suggested holidays, set each to closed, special hours, or a holiday template.
28. A holiday template: prix-fixe, one or two fixed seatings about 2 hours apart, longer turn times, prepayment, stricter cancellation (e.g. 72h, no exceptions).
29. Holiday booking opens on its own date, earlier than normal ("NYE bookings open 1 November at 10:00").
30. Mother's Day: brunch extended and opened earlier, with heavier pacing at peak times.
31. Valentine's: realistic seatings with deliberately no overbooking, and a waitlist to refill cancellations.
32. Reuse last year's holiday setup ("copy Thanksgiving 2026 to 2027").
33. A warning when a known upcoming holiday has no decision yet ("Thanksgiving is in 3 weeks; open as normal?").
34. Large-party rules for the season (December groups need a deposit).
35. A waitlist-only venue takes reservations for a season (Thanksgiving through Valentine's).
36. Holiday changes appear on the public venue page and open sign; changes to external listings such as Google are noted as out of scope for now.

### E. Closing the venue

37. Planned multi-day closure (vacation, renovation week) as one date-range closure, not seven overrides.
38. Seasonal shutdown (closed January to March) that reopens automatically.
39. Periodic closure (closed every Monday in January).
40. Emergency same-day closure (snow, power or water outage, staffing) done in seconds from a phone.
41. Close early tonight (kitchen problem) without touching the template.
42. Partial closure: one area (patio for rain, private dining room bought out), or kitchen-only (bar walk-ins only, no dining bookings).
43. Close by channel: stop online bookings only, stop in-house only, stop the waitlist, or all three.
44. Pause online booking indefinitely ("temporarily not taking reservations") with a guest message, until it's resumed.
45. Permanent closure: stop every channel, deal with all future bookings, and keep the venue visible but not bookable.
46. A closure reason with an internal note for staff ("burst pipe") and a separate message for guests ("closed for repairs").
47. Before saving, the manager sees the reservations affected (count, guests, covers, deposits held) and the list.
48. Bulk-cancel the affected reservations with a closure-specific message (not the generic cancellation email), choosing email and/or SMS.
49. Deposits and card holds on venue-cancelled bookings are refunded or released in full, automatically.
50. Affected guests are offered rebooking: suggested nearest open dates and times through their manage link.
51. Alternatively keep the bookings and only notify ("we open at 19:00 instead of 17:00; your 17:30 is moved to 19:00, reply to cancel").
52. A booking that starts before a closure and runs into it is flagged as affected.
53. A closure crossing midnight (closed 22:00 Fri to 12:00 Sat) affects the right service days.
54. Reopen early: remove the closure, slots return, and a waitlist or notify-me list hears first (Second Chance boundary).
55. A closure stays in an audit trail: who closed, when, and why.

### F. Seating areas and inventory

56. Mark which areas are bookable per shift (patio at dinner only, bar never online).
57. Seasonal area: the patio is bookable only in summer and only while that area is open.
58. Hold some tables back for walk-ins or phone; only the rest go online.
59. Party-size limits per area (bar 1–2, PDR 8–20).
60. A guest picks a seating preference and sees that area's availability.
61. Take a table out of service for a date without editing the floor plan.
62. A small venue with no areas just works as one room.
63. Several floor plans (summer and winter layouts) attached to templates or date ranges.

### G. Turn times, buffers, pacing

64. Turn times by party size, per shift (lunch 60 minutes, dinner 105).
65. Turn-time override per area or table type (bar 60, PDR 180).
66. A buffer between reservations on a table (15-minute reset).
67. Pacing: at most N covers starting per interval, per shift.
68. Custom pacing on specific slots (cap 19:30, allow more at 21:00).
69. Pacing by number of parties as well as covers.
70. Maximum covers per shift.
71. Walk-ins count against pacing and inventory, explicitly.

### H. Party size and booking window

72. Minimum and maximum online party size per shift; larger parties go to "request" or "call us".
73. A large-party threshold triggers a policy (deposit) or a flow (request; see the Big Table boundary).
74. A booking window that opens N days ahead and releases at a set time.
75. Minimum notice per shift (same-day lunch is fine; dinner needs 2 hours).
76. Stop online bookings for a shift at a cutoff (no online dinner bookings after 16:00 today).
77. The server enforces all of these, so the API can't book what the widget wouldn't offer. [PA: hours only]

### I. Policies: prepayment, deposits, cancellation

78. A venue-default cancellation policy, editable in the UI (free until 24h, 50% late fee, 100% for no-shows).
79. Deposit or card hold only for certain shifts, dates, areas, events or party sizes.
80. Full prepayment for special menus, holidays and events.
81. Named policies reused across templates, overrides and events ("Holiday prepay").
82. The applicable policy is shown to the guest in plain words before they commit.
83. An existing booking keeps the policy it was made under after the policy changes.
84. Repeat no-show guests are auto-required to leave a deposit (an existing setting, now visible and editable).
85. The manager previews "what would a party of 6 pay, and agree to, on 31 December at 20:00?"
86. Venue-initiated cancellation always waives fees and refunds in full, whatever the policy.

### J. Special events

87. A one-off event (a wine dinner) with its own times, capacity, price, menu note and policy, running **alongside** normal service with its own inventory and pacing.
88. An event that **replaces** normal service for its window (normal slots hidden, event bookable).
89. Ticketed event: sold by capacity (seats), not tables, with a per-order limit and ticket types (GA, VIP, child), paid or free.
90. Recurring event showings (jazz every Thursday, a series of tastings); each showing is fixed once tickets are sold.
91. Event sales windows: on sale from a date, closing a set time before; online and in-house windows set separately.
92. Add-ons on event bookings (wine pairing, cake).
93. An event refund policy: never, always, or a 24/48/72-hour or 1-week cutoff.
94. Events start as drafts, then publish; a sales view shows sold vs capacity and status (not yet on sale, on sale, sold out, closed).
95. A sold-out event takes a notify list or waitlist.
96. Per-event guest messages (confirmation and reminder copy) on top of the defaults.
97. The venue cancels or reschedules an event: every ticket holder is notified and refunded, or moved, in one action.
98. Holiday-party season: hold blocks of the room for December private parties without closing public availability.
99. Event setup is reusable ("duplicate last month's wine dinner").

### K. Private dining and buyouts

100. A private dining room listed as a whole bookable space: guest range, F&B minimum and/or room fee, deposit credited to the final bill, service charge shown up front.
101. Instant book for a simple PDR, or inquiry → proposal → contract → deposit for complex ones (the Big Table boundary; this run supplies the space and its availability).
102. Final headcount due date (5–7 days before), with reminders.
103. Partial buyout: one room or section is removed from public availability for the window, and the rest of the venue stays bookable.
104. Full buyout: the venue is closed to the public for the window with a guest message, and existing bookings are handled as a closure (E47–E51).
105. Buyout pricing that differs by day and space (weekday flat fee, weekends by inquiry).
106. A tentative hold on a space while a proposal is pending, expiring automatically.

### L. Night-of changes (Host)

107. Pause online booking for the rest of tonight in one tap.
108. Close early tonight.
109. Block a slot or table for the next hour.
110. Lower tonight's pacing on the fly.
111. Night-of changes expire at the end of the service day and never touch templates.
112. Hosts can make night-of changes only; templates, policies, events and closures are manager-only (emergency closure permission configurable).

### M. Guest experience

113. Only times that can really be served are offered: hours, shift, area, pacing, buffer, party size, events, closures and policy all applied.
114. Closed, sold-out and fully booked dates are visibly distinct on the date picker. [PA: closed dates]
115. A closure or holiday message appears on that date. [PA: override note]
116. Events show as their own bookable items beside normal times.
117. An over-limit party gets the venue's chosen path, with a reason.
118. The policy appears before confirming.
119. A displaced guest gets a clear closure message with rebook options and refund status.
120. Gen-UI and the widget show the same availability from one source.

### N. Multi-venue group

121. Copy one venue's templates, policies and events to another.
122. A shared holiday calendar and holiday decisions applied to every venue in the group.
123. Group defaults with per-venue overrides. Inheritance itself is the Moonshot seed; this run's model must not prevent it.

### O. Migration, setup and correctness

124. Existing venues' hours and settings (pacing, duration rules, max party size) migrate with no change in what guests see. [PA: hours]
125. Seed data produces a bookable demo venue. [PA]
126. Timezone and DST: local-time shifts stay correct across DST, including overnight shifts on the change night. [PA]
127. Every configuration change (templates, overrides, closures, events, policies) is audited.
128. The live preview evaluates a draft against real bookings for any date range before saving, and lists stranded reservations.
129. Concurrency: two managers editing overrides, or a closure saved while guests are booking, never produce a booking inside a closure. [PA: hours lock]

### P. Gap review (added 2026-10-27, numbered last so existing numbers stay stable)

130. A venue-wide occupancy ceiling (the fire-code limit) counts service, events, walk-ins and buyouts together, so no combination of layers exceeds it.
131. Counters and communal tables sell seats, not tables: a party of 2 at an 8-seat counter uses 2 seats.
132. Wheelchair-accessible tables are held for guests who need them, and a guest can filter availability by that need.
133. Inventory or times reserved for an audience (members, VIPs, hotel guests, corporate accounts), including early access before public release and a private link for a soft opening.
134. Before opening: bookings open ahead of the first service date, soft-launch nights run at reduced capacity, and the first week can be invite-only.
135. Release-time fairness: a limit on bookings per guest per night or period, protection against bots and hoarding, and correct holds under a burst of concurrent requests when popular dates open.
136. A change policy separate from cancellation: a cutoff for changes, a limit on growing the party, and a change that moves the booking into a different shift or policy.
137. Reconfirmation on peak nights: guests confirm by a deadline, or the booking is released.
138. A late-arrival grace period per shift, after which the booking is marked a no-show and its table is freed.
139. Party-size rules by slot or table size (no 2-tops on 6-tops at 19:30 on Saturday; a minimum party size at peak).
140. Age or audience rules by time or area (21+ after 21:00, no children at the bar).
141. Limited menu-item inventory sold alongside normal service (20 tasting menus a night).
142. Spend minimums on normal tables (bottle-service table minimums), not only the private dining room.
143. A 24-hour venue has no gap between service days; the service-day boundary and Tonight expiry still behave predictably.
144. A fixed-date holiday on 29 February, and every yearly rule, behaves predictably in non-leap years.
145. No holiday warning for a holiday that falls on a day the venue is already closed.
146. Dates beyond the last decided holiday can be held back from booking, so bookings are not taken and then stranded by a later holiday decision.
147. A change is drafted by one Manager, approved by the owner, and published on a set date.
148. Editing the floor plan (deleting, merging or resizing tables) runs the same stranded-booking check as a closure.
149. Deleting or archiving a template that future dates still use shows those dates and asks what replaces it.
150. Hours imported from Google Business Profile or a CSV export from another reservations vendor.
151. Conversational setup through gen UI ("we're open for dinner Tue–Sat, 5 to 10").
152. Public opening hours differ from bookable hours (the bar is open until 02:00, bookings stop at 22:00, the kitchen closes at 21:30), and both are shown correctly.
153. Closure, holiday and event messages in more than one language.
154. With nothing free, the guest is offered alternatives: nearby times, other dates, another party size, or a sister venue.
155. Turnaways (searches that found no availability) are recorded as demand data per date, time and party size.
156. A pre-shift feed shows the team what changed for tonight (lower pacing, a blocked patio, a new closure).
157. A space shared across venues (a hotel event room used by several outlets, a food-hall seating area) has one inventory.
158. Pacing by party size: no two parties of 8+ start within 30 minutes of each other, whatever the cover count.
159. A standing reservation (the same guest every Friday at 19:00) holds inventory weeks ahead, and closures and template edits treat it like any booking.
160. Held tables release on a schedule: tables held for walk-ins, phone or VIPs go online at a set time before service if still unsold.
161. The guest picks a booking type with its own duration and inventory (a one-hour drink at the bar, a full dinner, a chef's counter seat).
162. The guest sees how long the table is theirs ("we'll need the table back by 21:00") before confirming.
163. One venue runs different concepts by time of day (a café by day, a cocktail bar by night), each with its own name, booking page and rules.
164. A date notice without a closure ("parade on Main St, use the back entrance"), shown to guests booked or booking that date and optionally sent to existing bookings.
165. Seating times relative to sunset (an iftar seating during Ramadan, a patio open until dusk) move each day by the venue's location.
166. Event and buyout setup and teardown time keeps the space unavailable before and after the event window.
167. Booking a space makes a linked space unavailable (the PDR's noise means the adjacent booth section closes).
168. A booking that spans two shifts with different rules gets one clear owning shift for its policy, pacing and duration.
169. Staff waive a cancellation or no-show fee with a reason, and the waiver is audited.
170. Ticket holders can transfer an event ticket to another guest before a cutoff.
171. Infants and young children are counted separately from covers, and high chairs and boosters are a limited inventory.
172. Areas carry attributes a guest can filter on (dog-friendly patio, booth, quiet room), distinct from accessibility needs.
173. Configuration warnings before save: pacing above what the tables can seat, a shift with no online-bookable tables, a turn time longer than the shift.
174. A health alert when the venue has no bookable availability in the next 14 days, or a channel is paused longer than a set time.
175. The Manager is told when a date is close to sold out, with a suggested change (open more tables, extend a shift).
176. Guests join a "tell me when bookings open" list for dates not yet released or a seasonal reopening, and hear when they open.
177. Prices or fees vary by time: an off-peak discount at 17:00, or a prime-time booking fee on Saturday at 19:30.
178. Restaurant Week: a set menu and price for a date range on chosen shifts, with its own pacing, flagged on each booking.
179. A recurring closure relative to sunset (closed from Friday sunset to Saturday nightfall for Shabbat) moves each week.
180. A Manager going on leave grants another staff member Manager rights until a set date, and the grant expires on its own.
181. When someone books for another person (a concierge or an assistant), closure and change notices reach both the booker and the diner.
182. Special hours and closures are published as structured data on the public venue page, so search engines show them.
183. Gift vouchers and promotions have blackout dates and shifts, and the guest sees that before choosing a time.
184. Large parties need more notice than the shift minimum (10+ book at least 48 hours ahead, so the kitchen can prepare).
185. A bad weather forecast for an outdoor area prompts the Manager to decide on that area ahead of time.
186. Pacing follows the staff rota: fewer servers or cooks scheduled lowers that shift's pacing.
187. A surge in takeout and delivery orders lowers dine-in pacing for the affected intervals.
188. Staff subscribe to a calendar feed of closures, special hours and events.
189. The Manager sets how long a slot is held while the guest completes checkout, longer for prepaid bookings that need card entry.
190. Release in batches instead of a rolling window: next month's dates all open on the 1st at 10:00.
191. A guest asks for a time the venue doesn't offer, and the Manager accepts or declines the request.
192. Each shift shows the guest its own menu (brunch vs dinner) while they pick a time.
193. Replay a proposed change against last month's real demand and turnaways ("a 21:30 seating would have added about 40 covers").

## Success in one sentence

A manager at any venue size, from a 40-seat bistro to a multi-room venue, can set up their real weekly service in under 15 minutes by reusing one day's setup: several shifts, areas, turn times, pacing, and prepayment and cancellation rules, plus a year of holidays and closures. The widget never offers a time the venue can't serve, and no guest arrives to find the venue closed.

## Unknowns & risks

- **Scope is too big for one ship.** 129 scenarios across time structure, holidays, closures, inventory, pacing, policies, events and private dining will stall if built as one piece. PRD must phase it. A likely order:
  1. Shifts, templates, overrides, closures with guest handling, server enforcement, and the preview, salvaging prior art.
  2. Holidays: recurring and moving dates, the calendar, holiday templates.
  3. Areas, channels and pacing depth.
  4. Policies.
  5. Events and private dining.
- **The UI may be too complex to understand.** Each added layer is another place to look. Simplicity is a top risk: progressive disclosure, a calendar-first view, and the live preview must keep the configuration readable to a bistro owner. Run the cheapest kill test before building.
- **Every complex requirement must be covered.** Operators combine rules: one override can change the policy, close an area, and set special hours for an event at once. The scenario catalogue is the coverage checklist that PRD and Architect must trace.
- **Data model extensibility.** Events, ticketing, combined tables, group inheritance and external listing sync must fit later without another rewrite. The prior run's capped JSON overrides and today's untyped blobs are the warning.
- **Overlap with events and table combinations.** Private dining, buyouts and large parties collide with Big Table (`docs/plans/2026-10-18-big-table.md`: `EventRequest`/`EventProposal`, linked reservations grouped by `eventId`) and with Open Door (ticketed seatings, memory note only). A reservation holds one table today. PRD must draw the line: this run owns when and what is bookable, plus the event and space inventory; Big Table owns the request → proposal → contract flow and multi-table seating.
- **Migration, with no real venue.** Existing JSON configuration, the stalled prior-art branch (975 commits behind), and broken seed data all have to converge without changing what guests see. With no live restaurant, nothing outside the team checks the model against real operations.
- **Dependency, not a risk to this run:** prepayment, deposit and event-ticket rules can be configured, but nothing can be charged until Stripe is live in prod (WO-0021/0022). External listing sync (Google hours, Reserve with Google) is not built and is out of scope here.
