---
stage: ux
run: feature:availability-phone-tonight
date: 2026-11-08
assumptions:
  - "Drafted by the agent from prd.md and code facts; the Owner delegated. Rialto components only (Text, Tag, Link/Button), CSS Modules with --rialto-* tokens."
  - "Phone = useViewport() === 'phone' (max-width 767 px). The form's own CSS breakpoints (720/640 px) are left as they are; the phone line behaviour keys off useViewport only, so it is one rule."
---

# UX: Availability on a phone, and what's on tonight

## F1. The Today line (PRD 5–8)

### Where

In the page header's description slot, on every layer, for Manager and Host. It replaces the static "Your hours, holidays and one-off changes." once today's state has loaded. That line still shows while loading and for an empty venue, so nothing moves. The line is one flowing run of text: label, date, hours, items, link. It wraps on a phone and has no rows or margins of its own.

*Amended at Implement (2026-11-08): the first build placed it as its own block under the header. It cost 50 px on desktop and 78 px on a phone, and failed the calendar first-screen guards in `availability-phone.spec.ts`, which protect what the calendar shows above the fold.*

```
┌ Availability ───────────────────────────────────────── Close…  Pause ┐
│ Today  Sun, Nov 8 · Lunch 11:30 AM–3:00 PM · Dinner 5:00–10:00 PM    │
│        [Closing early · 9:30 PM] [2 tables blocked · rest of tonight]│
│        Change tonight →                                              │
│ ⚠ Online booking paused                                     Resume   │  ← existing banner, unchanged
│ Schedules | Calendar | Special dates                                 │
```

At 375 px:

```
Today  Sun, Nov 8
Lunch 11:30 AM–3:00 PM · Dinner 5:00–10:00 PM
[Lunch closed] [Closing early · 9:30 PM]
Change tonight →
```

### Content, in order

1. **"Today"** (strong), then the service day's date in muted text ("Sun, Nov 8"). After midnight and before the rollover, it is the service day still running: "Today Sun, Nov 8" at 1:00 AM on Monday.
2. **Hours:**
   - each service open that day: "<Service> <opens>–<closes>", joined by " · ";
   - a service closed for the whole day is left out here and named as an item (below);
   - a day with no open service reads **"Closed"**, with no items about closures, since the day is simply closed.
3. **Items**, each a neutral Rialto `Tag` (not dismissible, not a control). In this order:

   | In force today | Text |
   |---|---|
   | A service closed all day | "Lunch closed" |
   | A section closed all day | "Patio closed" |
   | The venue closing from a time (a closure with a start time) | "Closing early · 9:30 PM" |
   | A service or section closing from a time | "Dinner closing early · 9:30 PM" |
   | Booking paused (a closure on booking channels) | "Online paused", "Phone paused", "Online and phone paused"; with a time: "Phone paused from 6:30 PM" |
   | Night-of close early (Timeline) | "Closing early · 9:30 PM" (the Timeline's chip) |
   | Night-of stop window | "No bookings 7:30–8:00 PM" (the Timeline's chip) |
   | Night-of blocked tables | "2 tables blocked · rest of tonight" (the Timeline's chips, incl. from/window variants) |
   | Night-of pacing | the Timeline's pacing chip |
   | Night-of online pause | "Online paused · rest of tonight" |

   - **Said once:** when the online-pause banner is showing, the line does not include an online pause (its own night-of chip, or the online part of a channel closure). "Online and phone paused" becomes "Phone paused".
   - Two items with the same text (a close-early made both ways) show once.
4. **"Change tonight"**, a Rialto link to `/timeline?tonight=open`, which opens the Timeline's Tonight panel (popover on desktop, sheet on a phone). The same link for Manager and Host. Nothing else on the line is interactive.

### States

- **Loading:** the line's box keeps one line's height (a muted "Today" with no hours), so the page below does not move when it fills.
- **Failed:** "Couldn't load today's hours." plus a Retry button; the rest of the page works.
- **Nothing in force:** hours only, plus the link.
- **No services configured** (empty venue): no line; the setup form is the page.

### Accessibility

- The line is a `<section aria-labelledby>` with the "Today" heading text. Items are a `<ul>` labelled "In force tonight".
- No live region on first paint. When a change made on this page (Close…, Pause) alters today, the line updates silently; the toast already announces it.

## F2. Phone service lines (PRD 1–4)

### Where

The week form at phone width in:
- the Schedules week panel;
- Change regular week;
- the schedule editor (New, Duplicate, Edit).

Not onboarding, at any width. Tablet and desktop are unchanged.

### Closed line

One full-width button per service, styled as a list row with a chevron:

```
┌───────────────────────────────────────────────┐
│ Lunch                                       ⌄ │
│ 11:30 AM–3:00 PM · Every day                  │
├───────────────────────────────────────────────┤
│ Dinner                                      ⌄ │
│ 5:00–10:00 PM · Every day                     │
└───────────────────────────────────────────────┘
  + Add another service
```

- **Name:** the service's name, or "Service 2" when empty.
- **Hours:** "<opens>–<closes>", with "(next day)" when it wraps past midnight.
- **Days:** the same weekday phrase the form uses elsewhere ("Every day", "Mon–Thu", "Fri, Sat"). For a service on its own days, those days.
- **Different hours on some days:** add " · other hours Fri, Sat" (the days of its extra blocks).
- **Accessibility:** accessible name "Lunch, 11:30 AM–3:00 PM, Every day"; `aria-expanded`; `aria-controls` points at the controls region.

### Open line

The same row as the header, with the chevron turned up and the service's existing controls below it, unchanged: presets, name, times, days, different hours, Remove.
- Pressing the header closes it.
- Opening one service closes any other.
- On first paint no service is open, unless one has a problem.

### Problems

- A service with a problem is open. Its header shows the problem line under the summary in the error tone; the field-level `IssueText` stays where it is.
- Its header does not close it while the problem stands: pressing does nothing and the chevron is hidden.
- More than one service with problems: all of them are open, the exception to one-at-a-time.
- A blocked Save opens the first service with a problem, if it isn't already open, and focuses that problem's field.

### Focus and announcements

- Opening or closing keeps focus on the header; screen readers hear the expanded state.
- **Add another service:** the new service opens with its name focused, and the others close.
- **Remove:** focus moves to the next service's header, or the previous one's if it was last.
- **After Save:** every line closes, and focus stays where the Save flow already puts it.

### Guest preview on a phone

In the week panel at phone width, the Guest preview is one closed row, "Guest preview", with its hint. It opens the existing preview inline below the row (`aria-expanded`). It stays closed on first paint.

*Amended at Implement (2026-11-08): with the service lines closed, the form column measured 523 px but the preview stacked under it at 915 px, so the panel stayed at 1,553 px against P2's ≤ 1,236. The audit's item #2 had proposed this row; prd.md had left it out, and it is now in.*

### Desktop / tablet / onboarding

Unchanged: every service expanded, no headers, Guest preview beside the form.

## Copy (en-US; es-MX and fr-CA in the catalogs)

- `today.label`: "Today"
- `today.closed`: "Closed"
- `today.items`: "In force tonight"
- `today.serviceClosed`: "{{name}} closed"
- `today.closingEarly`: "Closing early · {{time}}"
- `today.targetClosingEarly`: "{{name}} closing early · {{time}}"
- `today.paused`: "{{channels}} paused"; `today.pausedFrom`: "{{channels}} paused from {{time}}"
- `today.change`: "Change tonight"
- `today.loadError`: "Couldn't load today's hours."
- `today.retry`: "Retry"
- `quickSetup.line.otherHours`: "other hours {{days}}"
- `quickSetup.line.nextDay`: "(next day)"

Channels reuse the existing channel names. The night-of chips reuse `availability.tonight.chip.*`.

## Scenario walk-through (targets)

- **P1 (phone):** tap Dinner (1), Closes (2: open and pick 11:00 PM), Save (1) = 4. Dinner's line is in the first viewport.
- **T1:** load `/availability`; the line reads "… [Lunch closed] [Closing early · 9:30 PM]" with 0 clicks.
- **T2:** "Change tonight" (1) opens Timeline with Tonight open.
