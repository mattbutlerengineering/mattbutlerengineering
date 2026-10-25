---
stage: prd
run: feature:venue-availability
date: 2026-10-25
ux: required
assumptions:
  - Setup-time criteria are measured with Matt standing in for an operator. No real venue is available (idea.md "Gap").
  - Phases 4–5 can be configured and shown to guests before Stripe is live in production. Charging money is out of scope here (WO-0021/0022).
  - The prior-art branch `feature/venue-hours-services` is input to Architect, not a dependency. Stories it already covers are marked [PA].
---

# PRD: Venue availability configuration

## Problem statement

A venue can describe its availability only as one open/close window per weekday. With that alone, a real restaurant cannot run lunch and dinner, close for a holiday or a snowstorm, serve past midnight, keep the patio for dinner only, give each service its own turn times or pacing, ask for prepayment on New Year's Eve, sell a ticketed wine dinner, or rent out a private dining room.

The booking widget therefore offers times the venue cannot serve. Managers patch this by hand, and when they close, guests who already booked are never told.

Setting up even the little that is possible means repeating the same work day after day. Nothing can be reused across days or seasons. The server enforces neither opening hours nor maximum party size.

(Inherited from idea.md, sharpened.)

## Solution

When every phase ships, a Manager builds availability from reusable pieces:

- **Schedule templates.** Named sets of shifts. Each shift has its own window, turn times, pacing, bookable areas and channels, party-size limits and policy.
- **A weekly assignment.** Templates are assigned to days, optionally limited to a date range.
- **A holiday calendar.**
- **Date and date-range overrides.** These close, partially close, or change a day.
- **Events and private spaces.** Layered on top of normal service or replacing it.

The more specific layer always wins, and the editor shows which layer each value came from.

A **live guest preview** beside every editor shows the exact times a guest could book on any date under the unsaved draft. The same preview lists any existing reservations the change would strand.

**Closures handle the people affected.** The Manager must choose to cancel and refund (with rebooking offers), keep and notify, or knowingly keep silently.

**Hosts** make temporary changes tonight that expire at the end of the service day.

**Guests** see only times the venue can really serve, plus the policy and any closure message. The server enforces the same rules, so no channel can book what the widget would not offer. Staff may override soft limits only, with a logged reason.

The work ships in five phases (below). Each phase is useful on its own. Architect designs a single extensible model that covers all five from the start.

## Phases

1. **Time structure + closures.** Shifts, templates, weekly assignment, copy/reuse, date and range overrides, closures with affected-guest handling, night-of Host changes, server enforcement, staff override, live preview, migration. Also in Phase 1, found during UX Design: fixing guest manage links, which today point at the site root instead of the manage page and are needed by closure rebooking; and introducing Manager vs Host venue roles, which nothing enforces today. Scenarios: A, B, C, D21–23, E (except E42), H77, L, M113–115, M119–120, O.
2. **Holidays.** Recurring and moving holidays, region-pluggable calendar (US first), holiday templates, holiday booking windows, missing-decision warnings, year-over-year copy. Scenarios: D24–36.
3. **Inventory + pacing.** Areas per shift, channels and holdback, seasonal areas, table out of service, floor plan per template, turn times, buffers, pacing, party-size limits, booking windows, cutoffs, closing one area. Scenarios: E42, F, G, H72–76.
4. **Policies.** Named cancellation, deposit and prepay policies attached to shifts, areas, overrides, events and party sizes; guest-facing terms; policy preview. Scenarios: I.
5. **Events + private dining.** Events alongside or replacing service, ticketed capacity (absorbs Open Door), showings, sales windows, add-ons, event refunds, private spaces, buyouts, tentative holds. Scenarios: J, K, M116.

Later, not this PRD: group copy and shared calendars (scenarios N).

## Actors

- **Manager**: venue owner or GM. Configures templates, assignments, overrides, closures, holidays, areas, pacing, policies and events, and decides what happens to affected bookings.
- **Host**: front-of-house staff working today's service. Makes night-of changes only. An emergency full closure requires a Manager-granted permission, set per venue.
- **Guest**: books through the booking widget, generative UI, or by phone via staff. Receives confirmations, closure notices and rebooking offers.
- **Group Operator**: runs several venues. Has no stories in this PRD, but the model must not prevent their later stories (copying config, shared holiday calendars, inheritance).
- **System**: the availability engine, enforcement on every booking path, and notifications.

## User stories

Each story is tagged with its phase and traced to the idea.md scenario numbers. [PA] means the prior-art branch implements it.

### Phase 1: time structure, reuse, closures

1. As a **Manager**, I want to give a day several named shifts (lunch, dinner, late), so that the hours between services are not bookable. (B7–8) [PA]
2. As a **Manager**, I want a shift to run past midnight, so that my late service is bookable on the day it starts. (B10) [PA]
3. As a **Manager**, I want to set a shift's last seating separately from its close, so that the kitchen's close is respected. (A4)
4. As a **Manager**, I want to set the slot interval or fixed seating times per shift, so that a tasting menu offers only 18:00 and 20:45. (A5, B12)
5. As a **Manager**, I want to mark a shift as walk-in only, so that the bar's happy hour is never sold online. (B9)
6. As a **Manager**, I want to save a set of shifts as a named template, so that I define "Weeknight" once. (C13)
7. As a **Manager**, I want to assign templates to days of the week, so that Mon–Thu share one setup. (A2, C13)
8. As a **Manager**, I want to copy one day's setup to other days in one action, so that I don't retype it. (A3, C15)
9. As a **Manager**, I want to edit a template and have every day using it update, so that a change happens once. (C14)
10. As a **Manager**, I want to choose how far an edit reaches (this date, this and later, or the whole template), so that a one-off change doesn't rewrite my week. (C18)
11. As a **Manager**, I want to duplicate a template into a variant, so that "short staffed" is a two-field change. (C20)
12. As a **Manager**, I want a template to apply only within a date range, so that summer hours start and end automatically. (C16)
13. As a **Manager**, I want one date to use a different template, so that a holiday Monday runs like a Sunday. (C17)
14. As a **Manager**, I want a week and month calendar showing which template or override governs each day, so that I can see my schedule at a glance. (C19)
15. As a **Manager**, I want to close a date, one shift on a date, or give a date special hours, so that holidays and one-offs are right. (D21–23) [PA]
16. As a **Manager**, I want to close a date range in one action, so that a vacation is one entry, not seven. (E37–38)
17. As a **Manager**, I want a repeating closure (every Monday in January), so that a seasonal pattern isn't hand-entered. (E39)
18. As a **Manager**, I want to close one channel only (online, in-house, waitlist), so that a phone-only night doesn't close the venue. (E43)
19. As a **Manager**, I want to pause online booking indefinitely with a guest message, so that I can stop taking reservations without deleting anything. (E44–45)
20. As a **Manager**, I want separate internal and guest-facing messages on any closure, so that staff see "burst pipe" while guests see "closed for repairs". (E46) [PA: guest note]
21. As a **Manager** closing time that has bookings, I want to see every affected reservation (count, covers, deposits held, list), including bookings that start before the closure and run into it, before I save. (E47, E52–53) [PA: count]
22. As a **Manager**, I must choose what happens to affected bookings (cancel, notify and refund; keep and notify; or keep silently with acknowledgement), so that no guest is stranded by accident. (E48–51)
23. As a **Guest** whose booking was cancelled by a closure, I want a closure-specific message with my refund status and up to 3 one-tap rebooking options, so that I can rebook in seconds. (E48–50, M119)
24. As a **Guest** whose booking was kept but changed, I want to be told what changed and how to cancel, so that I'm not surprised. (E51)
25. As a **Manager**, I want to remove a closure and have the slots return, so that reopening early is one action. (E54)
26. As a **Host**, I want to pause online booking for the rest of tonight, close early, block a slot or table, or lower tonight's pacing, so that I can react to the floor. (E40–41, L107–110)
27. As a **Host**, I want my night-of changes to expire at the end of the service day, so that tomorrow is never affected. (L111)
28. As a **Host** with the Manager's grant, I want to make an emergency full closure from my phone in seconds, so that a snow day is handled immediately. (E40, L112)
29. As a **Manager**, I want a live guest preview of my unsaved changes for any date range, listing stranded reservations, so that I know what guests will see before I save. (O128)
30. As a **Host** or **Manager** taking a phone booking, I want to override soft limits (last seating, pacing, party size) with a reason, so that I can accommodate a regular. Closures can't be overridden. (H77)
31. As a **Guest**, I want to be offered only times the venue can really serve, and to see a closure or special-date message, so that my booking is honoured. (M113–115) [PA: hours, closed dates]
32. As a **Guest** of a venue with nothing configured, I want a clear "not taking online bookings" state, so that I'm not shown an empty picker. (A6)
33. As the **System**, I want to reject any guest or API booking outside the resolved availability, so that no channel bypasses the rules. (H77) [PA: hours]
34. As a **Manager** of an existing venue, I want my current hours and settings to keep working unchanged, so that the upgrade costs me nothing. (O124–125) [PA]
35. As a **Manager**, I want every configuration change and closure decision recorded with who, when and why, so that I can audit what happened. (E55, O127)

### Phase 2: holidays

36. As a **Manager**, I want a fixed-date holiday rule entered once ("closed every 25 December"), so that I never forget it. (D24)
37. As a **Manager**, I want moving holidays (Easter, Mother's/Father's Day, Thanksgiving, Lunar New Year) computed for each year, so that the rule stays correct. (D25)
38. As a **Manager**, I want suggested holidays for my venue's region, with observed-date rules, so that I plan from a list instead of a blank calendar. (D26–27)
39. As a **Manager**, I want to plan a year of holidays in one sitting (closed, special hours, or a holiday template), so that the year is done in minutes. (D27)
40. As a **Manager**, I want a holiday template (prix-fixe, fixed seatings, longer turns, a policy reference), so that holiday nights are set up consistently. (D28, D30–31)
41. As a **Manager**, I want a holiday's booking to open on its own date and time, so that New Year's Eve opens on 1 November at 10:00. (D29)
42. As a **Manager**, I want to copy last year's holiday setup to this year, so that I reuse what worked. (D32)
43. As a **Manager**, I want a warning when an upcoming known holiday has no decision, so that I don't open by accident. (D33)
44. As a **Guest**, I want holiday hours and messages shown on the venue's public page and open sign, so that I know before I try to book. (D36)

### Phase 3: inventory and pacing

45. As a **Manager**, I want to choose which areas are bookable in each shift, so that the patio is dinner-only and the bar is never online. (F56)
46. As a **Manager**, I want a seasonal area that is bookable only within a date range, so that the patio opens for summer. (F57)
47. As a **Manager**, I want to hold back tables for walk-ins or phone, so that only part of the room is sold online. (F58)
48. As a **Manager**, I want party-size limits per area and per shift, so that the bar takes 1–2 and the PDR 8–20. (F59, H72)
49. As a **Manager**, I want to take a table out of service for a date, so that a broken booth isn't booked. (F61)
50. As a **Manager**, I want a floor plan attached to a template or date range, so that summer and winter layouts switch automatically. (F63)
51. As a **Manager**, I want turn times by party size per shift and per area, so that lunch turns faster than dinner and the PDR runs longer. (G64–65)
52. As a **Manager**, I want a reset buffer between bookings on a table, so that staff have time to turn it. (G66)
53. As a **Manager**, I want pacing per interval in covers and/or parties, with per-slot exceptions and a per-shift maximum, so that the kitchen isn't slammed at 19:30. (G67–70)
54. As a **Manager**, I want walk-ins to count against pacing and inventory, so that online availability reflects the real floor. (G71)
55. As a **Manager**, I want a booking window, a release time, a minimum notice and an online cutoff per shift, so that bookings arrive when I can handle them. (H74–76)
56. As a **Guest**, I want to pick a seating area and see its availability, so that I can book the patio. (F60)
57. As a **Guest** whose party is over the online limit, I want the venue's chosen path (call or request) with a reason, so that I'm not stuck. (H72–73, M117)
58. As a **Manager** of a one-room venue, I want none of the area settings to appear until I need them, so that setup stays simple. (F62)
59. As a **Manager**, I want to close one area only, so that a rained-out patio doesn't close the venue. Story 78 belongs to Phase 3; it is numbered last so existing story numbers stay stable. (E42)

### Phase 4: policies

59. As a **Manager**, I want to edit my venue's default cancellation and no-show policy in the app, so that it's not frozen in the database. (I78)
60. As a **Manager**, I want named policies (deposit, card hold, prepay, cancellation window and fees) that I attach to shifts, areas, overrides, holidays, events or party-size thresholds, so that New Year's Eve and parties of 8+ carry the right terms. (I79–81, H73, D34)
61. As a **Guest**, I want the applicable policy in plain words before I confirm, so that I agree knowingly. (I82, M118)
62. As a **Guest**, I want my booking to keep the policy it was made under, so that later changes don't penalize me. (I83)
63. As a **Manager**, I want to see and edit the repeat-no-show deposit rule, so that the existing automation is visible. (I84)
64. As a **Manager**, I want to preview what a given party, date and time would pay and agree to, so that I can check my rules. (I85)
65. As the **System**, I want venue-initiated cancellations to waive fees and refund in full, so that guests are never charged for our closure. (I86)

### Phase 5: events and private dining

66. As a **Manager**, I want to create an event (time, capacity, price, description, policy) that runs alongside normal service with its own inventory, or replaces service for its window, so that a wine dinner and a buyout both work. (J87–88)
67. As a **Manager**, I want ticketed events sold by seat capacity, with ticket types, per-order limits and add-ons, so that a tasting sells seats rather than tables. (J89, J92)
68. As a **Manager**, I want recurring showings, sales windows (online and in-house), draft-then-publish, and a sales view, so that I can run a jazz series. (J90–91, J94)
69. As a **Manager**, I want an event refund policy and per-event guest messages, so that each event communicates its own terms. (J93, J96)
70. As a **Guest**, I want sold-out events to offer a notify list, so that I hear if seats free up. (J95)
71. As a **Manager**, I want to cancel or reschedule an event and have every ticket holder notified and refunded or moved in one action, so that a cancelled event isn't a phone marathon. (J97)
72. As a **Manager**, I want to hold room blocks for party season without closing public availability, so that December private parties have space. (J98)
73. As a **Manager**, I want to duplicate a past event, so that a monthly dinner takes a minute. (J99)
74. As a **Manager**, I want a private dining room listed as a bookable space (guest range, F&B minimum and/or room fee, deposit credited to the bill, service charge shown, headcount due date), instant-bookable or by inquiry, so that guests can book or request it. (K100–102, K105)
75. As a **Manager**, I want a partial or full buyout that removes a space or the venue from public availability, with full buyouts handled like closures for existing bookings, so that a buyout never double-sells. (K103–104)
76. As a **Manager**, I want a tentative hold on a space that expires automatically, so that pending proposals don't block forever. (K106)
77. As a **Guest**, I want events shown as their own bookable items beside normal times, so that I can find them. (M116)

## Success criteria

Each criterion names the phase whose Verify must pass it.

- [ ] **The demo runs as written** (Phase 1). Before: the manager closes 24 December, saves, opens the widget in another tab to check, and never learns that 14 parties are already booked that night until they arrive. After: the manager marks 24 December closed. The calendar beside the editor immediately greys out the date in the guest preview and shows "14 reservations (52 guests) are booked on this date". One action cancels them with a closure-specific message, refunds deposits, and offers each guest the nearest open dates.
- [ ] **Setup time, small** (Phase 1). In a timed walkthrough without help text, Matt standing in for the operator sets up a bistro week (dinner 17:00–22:00 Tue–Sat, closed Sun–Mon) in ≤5 minutes, starting from an empty venue.
- [ ] **Setup time, large** (Phase 2, re-timed after Phases 3–5). The same tester sets up a multi-room week (brunch, lunch, dinner, late; three templates) plus a year of US holidays in ≤15 minutes, without help text.
- [ ] **Correctness** (every phase). A property test over generated configurations proves the engine never offers a slot outside the resolved availability (template, assignment, overrides, closures, night-of changes, plus each later phase's rules). A matching API test proves every guest or API booking request outside it is rejected with an error envelope.
- [ ] **Preview speed** (Phase 1). The live preview of an unsaved draft over 30 days on the seeded 250-seat venue returns, including the stranded-reservation list, at p95 ≤1s.
- [ ] **Migration** (Phase 1). A golden capture of every existing venue's slots, for a fixed 60-day window before and after migration, is identical, including both legacy hours shapes. The seed venue offers bookable slots.
- [ ] **Closure integrity** (Phase 1). After any saved closure, no active reservation overlaps it unless the Manager chose "keep" (logged with who and when). Every guest the Manager chose to notify is sent a closure-specific message within 2 minutes, on their preferred channel. Refunds on venue-cancelled bookings are full.
- [ ] **Rebooking offer** (Phase 1). Each cancelled guest's message holds up to 3 currently open slots for the same party size within 14 days, nearest the original time of day, each rebookable in one tap. With no slots, it holds a picker link.
- [ ] **Night-of expiry** (Phase 1). Every Host change is gone at the venue's service-day boundary, which a clock-advance test confirms, and leaves templates untouched.
- [ ] **Staff override** (Phase 1). Staff can book past soft limits only with a non-empty reason, which is shown on the timeline and audit log. Staff cannot book inside a closure.
- [ ] **Holiday correctness** (Phase 2). Moving US holidays and observed dates compute correctly for 2026–2030 against a fixture table. Adding a region requires only data, no code change (shown by a test fixture region).
- [ ] **Policy display** (Phase 4). For each tested booking (party, date, time), the guest sees the same terms the Manager's policy preview reports. A booking keeps its original terms after the policy is edited.
- [ ] **Event integrity** (Phase 5). An event's ticket count never exceeds its capacity under 20 concurrent purchase attempts. A buyout's window offers no public slots in its space.

## Out of scope

- **Charging money.** Stripe go-live is tracked as WO-0021/0022. Policies and tickets can be configured and shown; payment capture works only where Stripe already works.
- **External listing sync.** Google Business hours, Reserve with Google and marketplace listings.
- **Big Table's request → proposal → contract flow and multi-table seating.** This run supplies private spaces, their availability and holds; Big Table owns the proposal workflow and combining tables.
- **Waitlist backfill** when a closure lifts or a booking cancels (Second Chance).
- **Self-tuning availability** (the backlog Moonshot seed), and **group configuration copy, shared calendars and inheritance** (Group Operator stories). The model must leave room for them.
- **Server and section staffing assignment** (Section Painter).
- **BEOs, e-signed contracts and invoicing** for events.
- **Overbooking** on purpose (selling beyond capacity to cover expected no-shows).

## Open questions

- Which prior-art modules to salvage from `feature/venue-hours-services` (civil-date, service-day resolution, hours guard, legacy normalizer, draft ADR-027), and whether its JSON override storage survives the extensibility requirement. Answered by: Architect.
- Where layered configuration is stored (tables vs typed documents) so that new rule types don't force a rewrite. Answered by: Architect.
- How the live preview reaches p95 ≤1s (the idea.md spike). Answered by: an Architect spike, about 2 days.
- Interaction model for layers and edit reach, and progressive disclosure for a one-room venue. Answered by: UX Design, validated by the idea.md cheapest kill test before Phase 1 build.
- Closure-message copy for email and SMS, and the SMS length budget for 3 rebook links. Answered by: UX Design (ux-writing).
- Whether the Open Door idea is formally retired now that Phase 5 absorbs ticketed seatings. Answered by: Matt, at Phase 5 kickoff.

### Clarifications / Session 2026-10-25

- **Holiday regions at launch:** region-pluggable, US first. US federal holidays plus the dining holidays, with observed-date rules, ship with Phase 2. Adding another region is data, not code. Any region can add dates by hand.
- **Rebooking offer for closure-cancelled guests:** up to 3 currently open slots for the same party size within the next 14 days, nearest the original time of day, each a one-tap rebook through the manage link. If none qualify, a link to the full picker.
- **Host emergency closure:** off by default; a Manager grants it per venue.
- **Affected bookings on closure:** the Manager must pick one of three outcomes. None is a default.
- **Staff override:** soft limits only, with a reason; closures are hard limits.
- **Ticketed events:** owned by Phase 5 (absorbs Open Door).
- **Edit scope (from the UX audit):** the Manager chooses how far an edit reaches before editing, and the preview and stranded-booking check cover that whole scope.
- **Urgent closure notices:** for closures starting within 6 hours, notices go by SMS and email wherever the guest has that contact, subject to the existing contact policy; guests with no confirmed delivery appear on a call list.
- **Area closures:** moved to Phase 3 (story 78). In Phase 1, a rained-out patio is handled by blocking its tables from the Tonight panel (story 26).
