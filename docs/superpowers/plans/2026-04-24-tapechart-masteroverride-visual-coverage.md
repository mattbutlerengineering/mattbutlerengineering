# TapeChart + MasterOverride Visual Coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Playwright visual regression harness in `apps/rialto-web` to cover `TapeChart` and `MasterOverride`, closing the gap that let rialto 0.1.12's TapeChart layout bug ship.

**Architecture:** Add five sections (3 light + 1 dark TapeChart configurations + 2 light MasterOverride configurations) to the existing `/visual-test` harness page. Each section uses deterministic data — backdated `startDate`s so today's date never falls in the visible TapeChart window, and inline reservation lists with no RNG. Update `visual.spec.ts`'s `lightSections` and `darkSections` arrays. Generate baselines with `npx playwright test --update-snapshots`. Each task adds one section + its baseline + its spec entry as a single commit.

**Tech Stack:** Playwright + TypeScript, the existing `@playwright/test` config at `apps/rialto-web/playwright.config.ts`, the existing harness at `apps/rialto-web/src/pages/visual-test/VisualTest.tsx`, the existing visual spec at `apps/rialto-web/e2e/visual.spec.ts`.

**Spec:** `docs/superpowers/specs/2026-04-24-tapechart-masteroverride-visual-coverage-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/rialto-web/src/pages/visual-test/VisualTest.tsx` | Modify | Add 5 new `<Section>` blocks with deterministic data |
| `apps/rialto-web/e2e/visual.spec.ts` | Modify | Add 4 testids to `lightSections`, 1 to `darkSections` |
| `apps/rialto-web/e2e/screenshots/light-tape-chart-default.png` | Create | New baseline |
| `apps/rialto-web/e2e/screenshots/light-tape-chart-stress.png` | Create | New baseline |
| `apps/rialto-web/e2e/screenshots/dark-dark-tape-chart.png` | Create | New baseline (note `dark-dark-*` naming pattern matches existing dark sections) |
| `apps/rialto-web/e2e/screenshots/light-master-override-variants.png` | Create | New baseline |
| `apps/rialto-web/e2e/screenshots/light-master-override-requireHold-splitflap.png` | Create | New baseline |

No new files. All changes are additive.

---

## TDD Adaptation for Visual Regression

Classic TDD says "write the failing test first." For visual regression, the "test" is a screenshot diff, and the "failing" state is "no baseline exists yet." So each task follows this adapted cycle:

1. **Add the testid to `visual.spec.ts`** (so the test attempts to run)
2. **Run it — expect FAIL** (selector doesn't match anything yet, OR no baseline image exists yet)
3. **Add the `<Section>` block to `VisualTest.tsx`** (deterministic data, no RNG, no `new Date()`)
4. **Run with `--update-snapshots`** to generate the baseline image
5. **Run without `--update-snapshots`** to confirm the baseline is stable (PASS)
6. **Manually inspect the new screenshot** in `e2e/screenshots/<name>.png` — does it look correct?
7. **Commit** (.tsx + .spec.ts + .png together)

The manual inspection step is critical. The baseline becomes the source of truth — if it captures a buggy layout, every future run will pass against the bug. Always look at the PNG before committing.

---

## Task 1: TapeChart — `tape-chart-default` section

**Files:**
- Modify: `apps/rialto-web/e2e/visual.spec.ts` (add testid to `lightSections`)
- Modify: `apps/rialto-web/src/pages/visual-test/VisualTest.tsx` (add new `<Section>` block)
- Create: `apps/rialto-web/e2e/screenshots/light-tape-chart-default.png` (baseline)

- [ ] **Step 1: Add testid to lightSections array**

In `apps/rialto-web/e2e/visual.spec.ts`, find the `const lightSections = [...]` array (currently ends with `"dialog-open", "drawer-open"`). Insert `"tape-chart-default",` right before the closing `] as const;`:

```tsx
  "dialog-open",
  "drawer-open",
  "tape-chart-default",
] as const;
```

- [ ] **Step 2: Run the test — verify it fails**

From the repo root:
```bash
pnpm --dir apps/rialto-web exec playwright test -g "tape-chart-default" --reporter=list
```

Expected: FAIL. The selector `getByTestId("tape-chart-default")` finds no matching element on the harness page yet, so the test errors with a locator timeout.

- [ ] **Step 3: Add the harness section**

In `apps/rialto-web/src/pages/visual-test/VisualTest.tsx`, find the line `{/* ── Dark Mode Section ──────────────── */}` (around line 489 — the boundary between light and dark sections). Immediately BEFORE that comment, add:

```tsx
      {/* ── TapeChart — Default ─────────────── */}
      <Section id="tape-chart-default" title="TapeChart — Default">
        <div className={styles.card}>
          <TapeChart
            startDate="2026-01-15"
            endDate="2026-01-22"
            rooms={tapeChartDefaultRooms}
            reservations={tapeChartDefaultReservations}
            currency="USD"
            density="comfortable"
            viewMode="grid"
            onReservationClick={() => {}}
          />
        </div>
      </Section>
```

Add `TapeChart` to the imports at the top of the file. Find the import block from `@mattbutlerengineering/rialto` (currently imports `Accordion, Alert, Avatar, …`). Add `TapeChart,` alphabetically — between `Steps,` and `Table,`:

```tsx
  Steps,
  Table,
  TapeChart,
  Tabs,
```

Wait — `TapeChart` alphabetizes between `Tabs` and `Tag`. The existing file has `Tabs,` then `Tag,`. Insert between them:

```tsx
  Tabs,
  TapeChart,
  Tag,
```

Add the deterministic fixture data near the existing `tableData` constant (around line 80-84). After `tableData`, add:

```tsx
const tapeChartDefaultRooms = [
  { id: "r1", name: "101", category: "Standard", capacity: 2, status: "ready" as const },
  { id: "r2", name: "102", category: "Standard", capacity: 2, status: "occupied" as const },
  { id: "r3", name: "103", category: "Standard", capacity: 2, status: "dirty" as const },
  { id: "r4", name: "104", category: "Deluxe", capacity: 3, status: "ready" as const },
  { id: "r5", name: "105", category: "Deluxe", capacity: 3, status: "occupied" as const },
  { id: "r6", name: "106", category: "Deluxe", capacity: 3, status: "outOfOrder" as const },
  { id: "r7", name: "107", category: "Suite", capacity: 4, status: "ready" as const },
  { id: "r8", name: "108", category: "Suite", capacity: 4, status: "occupied" as const },
];

const tapeChartDefaultReservations = [
  { id: "rsv-1", roomId: "r1", start: "2026-01-15", end: "2026-01-18", status: "confirmed" as const, guestName: "Alice Tanaka", ratePerNight: 180, currency: "USD", source: "Direct" },
  { id: "rsv-2", roomId: "r2", start: "2026-01-16", end: "2026-01-21", status: "checkedIn" as const, guestName: "Bob García", ratePerNight: 180, currency: "USD", source: "Direct" },
  { id: "rsv-3", roomId: "r3", start: "2026-01-17", end: "2026-01-19", status: "tentative" as const, guestName: "Clara Singh", ratePerNight: 180, currency: "USD", source: "Booking.com" },
  { id: "rsv-4", roomId: "r4", start: "2026-01-15", end: "2026-01-22", status: "checkedIn" as const, guestName: "Daniil Patel", ratePerNight: 220, currency: "USD", source: "Direct" },
  { id: "rsv-5", roomId: "r5", start: "2026-01-18", end: "2026-01-20", status: "confirmed" as const, guestName: "Erika Mohan", ratePerNight: 220, currency: "USD", source: "Expedia" },
  { id: "rsv-6", roomId: "r7", start: "2026-01-15", end: "2026-01-17", status: "checkedOut" as const, guestName: "Fatima Hernández", ratePerNight: 320, currency: "USD", source: "Direct" },
  { id: "rsv-7", roomId: "r7", start: "2026-01-19", end: "2026-01-22", status: "confirmed" as const, guestName: "Gabriel Rossi", ratePerNight: 320, currency: "USD", source: "Direct" },
  { id: "rsv-8", roomId: "r8", start: "2026-01-16", end: "2026-01-19", status: "checkedIn" as const, guestName: "Hideo Bauer", ratePerNight: 320, currency: "USD", source: "Booking.com" },
];
```

- [ ] **Step 4: Generate the baseline**

Run from the repo root:
```bash
pnpm --dir apps/rialto-web exec playwright test -g "tape-chart-default" --update-snapshots
```

Expected: PASS. A new file appears at `apps/rialto-web/e2e/screenshots/light-tape-chart-default.png`.

- [ ] **Step 5: Manually inspect the baseline**

Open `apps/rialto-web/e2e/screenshots/light-tape-chart-default.png` in any image viewer. Verify:
- Rooms 101-108 stack vertically, one per row (NOT 2-per-row)
- Day header has a single row of 7 cells (Thu Jan 15 through Wed Jan 21)
- The "Rooms" leading cell in the day header is roughly the same width as the room labels below it
- Reservation bars align with their date columns
- No "today" indicator (today is well outside the visible window)

If anything looks wrong, investigate before committing — a buggy baseline silently locks in the bug.

- [ ] **Step 6: Re-run the test without update mode**

```bash
pnpm --dir apps/rialto-web exec playwright test -g "tape-chart-default"
```

Expected: PASS. The baseline matches itself.

- [ ] **Step 7: Commit**

```bash
git add apps/rialto-web/src/pages/visual-test/VisualTest.tsx \
        apps/rialto-web/e2e/visual.spec.ts \
        apps/rialto-web/e2e/screenshots/light-tape-chart-default.png
git commit -m "test(rialto-web): visual baseline for TapeChart default (8 rooms × 7 days)"
```

---

## Task 2: TapeChart — `tape-chart-stress` section (the load case)

**Files:**
- Modify: `apps/rialto-web/e2e/visual.spec.ts`
- Modify: `apps/rialto-web/src/pages/visual-test/VisualTest.tsx`
- Create: `apps/rialto-web/e2e/screenshots/light-tape-chart-stress.png`

This is the section that would have caught today's TapeChart layout bug. 24 rooms × 14 days.

- [ ] **Step 1: Add testid to lightSections array**

In `apps/rialto-web/e2e/visual.spec.ts`, append `"tape-chart-stress",` after the `"tape-chart-default",` line added in Task 1:

```tsx
  "tape-chart-default",
  "tape-chart-stress",
] as const;
```

- [ ] **Step 2: Run — verify it fails**

```bash
pnpm --dir apps/rialto-web exec playwright test -g "tape-chart-stress"
```

Expected: FAIL with locator timeout.

- [ ] **Step 3: Add the harness section**

In `apps/rialto-web/src/pages/visual-test/VisualTest.tsx`, immediately AFTER the `tape-chart-default` Section block added in Task 1, add:

```tsx
      {/* ── TapeChart — Stress (24 rooms × 14 days) ───────── */}
      <Section id="tape-chart-stress" title="TapeChart — Stress (24 × 14)">
        <div className={styles.card}>
          <TapeChart
            startDate="2026-01-15"
            endDate="2026-01-29"
            rooms={tapeChartStressRooms}
            reservations={tapeChartStressReservations}
            currency="USD"
            density="comfortable"
            viewMode="grid"
            onReservationClick={() => {}}
          />
        </div>
      </Section>
```

Add the stress fixture data after `tapeChartDefaultReservations`:

```tsx
const tapeChartStressRooms = Array.from({ length: 24 }, (_, i) => {
  const number = 1000 + i;
  const tier = i < 12 ? "Standard" : i < 20 ? "Deluxe" : "Suite";
  const capacity = tier === "Standard" ? 2 : tier === "Deluxe" ? 3 : 4;
  // Cycle deterministically through statuses (no RNG)
  const statuses = ["ready", "occupied", "dirty", "outOfOrder"] as const;
  const status = statuses[i % 4]!;
  return {
    id: `room-${number}`,
    name: String(number),
    category: tier,
    capacity,
    status,
  };
});

const tapeChartStressReservations = [
  // 30 hand-placed reservations spanning the 14-day window
  { id: "s-1",  roomId: "room-1000", start: "2026-01-15", end: "2026-01-18", status: "confirmed" as const, guestName: "Alice Tanaka", ratePerNight: 180, currency: "USD", source: "Direct" },
  { id: "s-2",  roomId: "room-1001", start: "2026-01-16", end: "2026-01-22", status: "checkedIn" as const, guestName: "Bob García", ratePerNight: 180, currency: "USD", source: "Direct" },
  { id: "s-3",  roomId: "room-1002", start: "2026-01-17", end: "2026-01-19", status: "tentative" as const, guestName: "Clara Singh", ratePerNight: 180, currency: "USD", source: "Booking.com" },
  { id: "s-4",  roomId: "room-1003", start: "2026-01-15", end: "2026-01-29", status: "checkedIn" as const, guestName: "Daniil Patel", ratePerNight: 180, currency: "USD", source: "Direct" },
  { id: "s-5",  roomId: "room-1004", start: "2026-01-18", end: "2026-01-21", status: "confirmed" as const, guestName: "Erika Mohan", ratePerNight: 180, currency: "USD", source: "Expedia" },
  { id: "s-6",  roomId: "room-1005", start: "2026-01-15", end: "2026-01-17", status: "checkedOut" as const, guestName: "Fatima Hernández", ratePerNight: 180, currency: "USD", source: "Direct" },
  { id: "s-7",  roomId: "room-1006", start: "2026-01-19", end: "2026-01-25", status: "confirmed" as const, guestName: "Gabriel Rossi", ratePerNight: 180, currency: "USD", source: "Direct" },
  { id: "s-8",  roomId: "room-1007", start: "2026-01-16", end: "2026-01-19", status: "checkedIn" as const, guestName: "Hideo Bauer", ratePerNight: 180, currency: "USD", source: "Booking.com" },
  { id: "s-9",  roomId: "room-1008", start: "2026-01-22", end: "2026-01-26", status: "confirmed" as const, guestName: "Ingrid García", ratePerNight: 180, currency: "USD", source: "Direct" },
  { id: "s-10", roomId: "room-1009", start: "2026-01-15", end: "2026-01-21", status: "checkedIn" as const, guestName: "Jiro Suzuki", ratePerNight: 180, currency: "USD", source: "Direct" },
  { id: "s-11", roomId: "room-1010", start: "2026-01-20", end: "2026-01-24", status: "confirmed" as const, guestName: "Kenji Tanaka", ratePerNight: 180, currency: "USD", source: "Expedia" },
  { id: "s-12", roomId: "room-1011", start: "2026-01-17", end: "2026-01-23", status: "checkedIn" as const, guestName: "Liam O'Neill", ratePerNight: 180, currency: "USD", source: "Direct" },
  { id: "s-13", roomId: "room-1012", start: "2026-01-15", end: "2026-01-19", status: "checkedOut" as const, guestName: "Mateo Lannister", ratePerNight: 220, currency: "USD", source: "Direct" },
  { id: "s-14", roomId: "room-1013", start: "2026-01-21", end: "2026-01-26", status: "confirmed" as const, guestName: "Noa Chen", ratePerNight: 220, currency: "USD", source: "Direct" },
  { id: "s-15", roomId: "room-1014", start: "2026-01-16", end: "2026-01-20", status: "checkedIn" as const, guestName: "Oksana Patel", ratePerNight: 220, currency: "USD", source: "Booking.com" },
  { id: "s-16", roomId: "room-1015", start: "2026-01-18", end: "2026-01-25", status: "confirmed" as const, guestName: "Priya Singh", ratePerNight: 220, currency: "USD", source: "Direct" },
  { id: "s-17", roomId: "room-1016", start: "2026-01-22", end: "2026-01-29", status: "tentative" as const, guestName: "Quinn O'Neill", ratePerNight: 220, currency: "USD", source: "Expedia" },
  { id: "s-18", roomId: "room-1017", start: "2026-01-15", end: "2026-01-22", status: "checkedIn" as const, guestName: "Rafael Hernández", ratePerNight: 220, currency: "USD", source: "Direct" },
  { id: "s-19", roomId: "room-1018", start: "2026-01-19", end: "2026-01-23", status: "confirmed" as const, guestName: "Sofía Rossi", ratePerNight: 220, currency: "USD", source: "Direct" },
  { id: "s-20", roomId: "room-1019", start: "2026-01-17", end: "2026-01-21", status: "checkedIn" as const, guestName: "Tyrion Bauer", ratePerNight: 220, currency: "USD", source: "Booking.com" },
  { id: "s-21", roomId: "room-1020", start: "2026-01-15", end: "2026-01-29", status: "checkedIn" as const, guestName: "Ursula Mohan", ratePerNight: 320, currency: "USD", source: "Direct" },
  { id: "s-22", roomId: "room-1021", start: "2026-01-20", end: "2026-01-25", status: "confirmed" as const, guestName: "Viktor Suzuki", ratePerNight: 320, currency: "USD", source: "Direct" },
  { id: "s-23", roomId: "room-1022", start: "2026-01-16", end: "2026-01-22", status: "checkedIn" as const, guestName: "Wren Tanaka", ratePerNight: 320, currency: "USD", source: "Direct" },
  { id: "s-24", roomId: "room-1023", start: "2026-01-23", end: "2026-01-28", status: "confirmed" as const, guestName: "Xander Patel", ratePerNight: 320, currency: "USD", source: "Direct" },
  // A second pass — overlapping reservations to exercise lane assignment
  { id: "s-25", roomId: "room-1003", start: "2026-01-19", end: "2026-01-21", status: "tentative" as const, guestName: "Yuki Singh", ratePerNight: 180, currency: "USD", source: "Direct" },
  { id: "s-26", roomId: "room-1009", start: "2026-01-23", end: "2026-01-26", status: "confirmed" as const, guestName: "Zara Bauer", ratePerNight: 180, currency: "USD", source: "Direct" },
  { id: "s-27", roomId: "room-1015", start: "2026-01-26", end: "2026-01-29", status: "confirmed" as const, guestName: "Anika García", ratePerNight: 220, currency: "USD", source: "Expedia" },
  { id: "s-28", roomId: "room-1017", start: "2026-01-25", end: "2026-01-28", status: "tentative" as const, guestName: "Bri Hernández", ratePerNight: 220, currency: "USD", source: "Direct" },
  { id: "s-29", roomId: "room-1023", start: "2026-01-15", end: "2026-01-19", status: "checkedOut" as const, guestName: "Cyrus O'Neill", ratePerNight: 320, currency: "USD", source: "Direct" },
  { id: "s-30", roomId: "room-1023", start: "2026-01-29", end: "2026-01-29", status: "confirmed" as const, guestName: "Dahlia Lannister", ratePerNight: 320, currency: "USD", source: "Direct" },
];
```

Note: reservation `s-30` has `start === end`, which means a 0-night reservation. Looking at `useTapeChartLayout.ts:55`, the layout filters out `rawEnd <= 0 || rawStart >= dayCount`. With a 0-night reservation we'd need `rawEnd > rawStart`. If that filter rejects it, the bar simply doesn't render — fine for our purposes, just one fewer bar in the screenshot. If you'd rather not risk it, change `s-30`'s `end` to `"2026-01-30"` (still produces a clipped end-of-window bar) or remove `s-30` entirely.

- [ ] **Step 4: Generate the baseline**

```bash
pnpm --dir apps/rialto-web exec playwright test -g "tape-chart-stress" --update-snapshots
```

Expected: PASS. New file at `apps/rialto-web/e2e/screenshots/light-tape-chart-stress.png` — likely tall (~1500-2000 px) and large (~150-300 KB).

- [ ] **Step 5: Manually inspect**

Open `light-tape-chart-stress.png`. **This is the goal-backward verification.** Confirm:
- Rooms 1000-1023 stack vertically. Each room has its own row. **No 2-rooms-per-row layout.**
- Day header has 14 cells in a single row (Thu Jan 15 through Wed Jan 28 — last visible day depends on viewport scroll position; the visible-viewport screenshot will only capture what fits).
- The "Rooms" leading column matches the room-label width below.
- No today indicator (today is not in the Jan 15-29 range).

If the image shows the buggy 2-cols-per-row layout, the rialto package wasn't rebuilt with the 0.1.12 fix. Run `pnpm --dir packages/rialto build` and re-run with `--update-snapshots`.

- [ ] **Step 6: Re-run without update**

```bash
pnpm --dir apps/rialto-web exec playwright test -g "tape-chart-stress"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/rialto-web/src/pages/visual-test/VisualTest.tsx \
        apps/rialto-web/e2e/visual.spec.ts \
        apps/rialto-web/e2e/screenshots/light-tape-chart-stress.png
git commit -m "test(rialto-web): visual baseline for TapeChart stress (24 rooms × 14 days)"
```

---

## Task 3: TapeChart — `dark-tape-chart` section

**Files:**
- Modify: `apps/rialto-web/e2e/visual.spec.ts` (add testid to `darkSections`)
- Modify: `apps/rialto-web/src/pages/visual-test/VisualTest.tsx` (add new Section inside the dark-mode wrapper)
- Create: `apps/rialto-web/e2e/screenshots/dark-dark-tape-chart.png`

- [ ] **Step 1: Add testid to darkSections array**

In `apps/rialto-web/e2e/visual.spec.ts`, find the `const darkSections = [...]` array. Currently ends with `"dark-avatar"`. Append `"dark-tape-chart",`:

```tsx
  "dark-banner",
  "dark-avatar",
  "dark-tape-chart",
] as const;
```

- [ ] **Step 2: Run — verify it fails**

```bash
pnpm --dir apps/rialto-web exec playwright test -g "dark-tape-chart"
```

Expected: FAIL with locator timeout.

- [ ] **Step 3: Add the harness section**

In `apps/rialto-web/src/pages/visual-test/VisualTest.tsx`, find the `dark-avatar` Section (around line 557-563 currently — inside the `<div data-theme="dark">` block). Immediately AFTER that Section's closing tag, add:

```tsx
          <Section id="dark-tape-chart" title="Dark — TapeChart">
            <div className={styles.card}>
              <TapeChart
                startDate="2026-01-15"
                endDate="2026-01-22"
                rooms={tapeChartDefaultRooms}
                reservations={tapeChartDefaultReservations}
                currency="USD"
                density="comfortable"
                viewMode="grid"
                onReservationClick={() => {}}
              />
            </div>
          </Section>
```

(Reuses `tapeChartDefaultRooms` / `tapeChartDefaultReservations` defined in Task 1 — same fixtures, dark theme inherited from the wrapping `data-theme="dark"`.)

- [ ] **Step 4: Generate the baseline**

```bash
pnpm --dir apps/rialto-web exec playwright test -g "dark-tape-chart" --update-snapshots
```

Expected: PASS. New file at `apps/rialto-web/e2e/screenshots/dark-dark-tape-chart.png` (note the `dark-dark-*` prefix matches existing dark sections — the testid starts with `dark-` and the spec adds another `dark-` prefix).

- [ ] **Step 5: Manually inspect**

Open `dark-dark-tape-chart.png`. Confirm:
- Surface tokens use dark variants (the bezel-like rounded corner is on a dark background, room-status dots are visible against dark surface)
- Text is readable (light foreground on dark background)
- Reservation bars distinguish their statuses (confirmed/checkedIn/tentative/checkedOut) — colors should be different from light mode
- No layout bugs

- [ ] **Step 6: Re-run without update**

```bash
pnpm --dir apps/rialto-web exec playwright test -g "dark-tape-chart"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/rialto-web/src/pages/visual-test/VisualTest.tsx \
        apps/rialto-web/e2e/visual.spec.ts \
        apps/rialto-web/e2e/screenshots/dark-dark-tape-chart.png
git commit -m "test(rialto-web): visual baseline for TapeChart in dark mode"
```

---

## Task 4: MasterOverride — `master-override-variants` section (3×3 grid)

**Files:**
- Modify: `apps/rialto-web/e2e/visual.spec.ts`
- Modify: `apps/rialto-web/src/pages/visual-test/VisualTest.tsx`
- Create: `apps/rialto-web/e2e/screenshots/light-master-override-variants.png`

- [ ] **Step 1: Add testid to lightSections array**

In `apps/rialto-web/e2e/visual.spec.ts`, append `"master-override-variants",` after `"tape-chart-stress",`:

```tsx
  "tape-chart-default",
  "tape-chart-stress",
  "master-override-variants",
] as const;
```

- [ ] **Step 2: Run — verify it fails**

```bash
pnpm --dir apps/rialto-web exec playwright test -g "master-override-variants"
```

Expected: FAIL with locator timeout.

- [ ] **Step 3: Add the harness section**

In `apps/rialto-web/src/pages/visual-test/VisualTest.tsx`, immediately AFTER the `tape-chart-stress` Section block added in Task 2, add:

```tsx
      {/* ── MasterOverride — Variants (3 sizes × 3 variants) ───────── */}
      <Section id="master-override-variants" title="MasterOverride — Variants">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, auto)",
            gap: "var(--rialto-space-lg)",
            justifyItems: "start",
          }}
        >
          {(["sm", "md", "lg"] as const).map((size) =>
            (["default", "warning", "danger"] as const).map((variant) => (
              <MasterOverride
                key={`${size}-${variant}`}
                label={`${size.toUpperCase()} ${variant}`}
                description={`${size} · ${variant}`}
                on={false}
                onChange={() => {}}
                size={size}
                variant={variant}
              />
            )),
          )}
        </div>
      </Section>
```

Add `MasterOverride` to the imports from `@mattbutlerengineering/rialto`. Find the alphabetical position — between `Input,` and `Meter,`:

```tsx
  Input,
  MasterOverride,
  Meter,
```

- [ ] **Step 4: Generate the baseline**

```bash
pnpm --dir apps/rialto-web exec playwright test -g "master-override-variants" --update-snapshots
```

Expected: PASS. New file at `light-master-override-variants.png`.

- [ ] **Step 5: Manually inspect**

Open the baseline. Confirm:
- 9 components in a 3×3 grid (3 columns).
- Top row: 3 `sm` components (default / warning / danger) — bezel ~7rem wide.
- Middle row: 3 `md` components — bezel ~9rem wide.
- Bottom row: 3 `lg` components — bezel ~12rem wide.
- All covers are CLOSED (showing the warning stripe pattern with the cover-text "LIFT TO ARM").
- Stripe color differs by variant: `default` is grey, `warning` is amber, `danger` is red.
- Each component shows its label above and description below.

- [ ] **Step 6: Re-run without update**

```bash
pnpm --dir apps/rialto-web exec playwright test -g "master-override-variants"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/rialto-web/src/pages/visual-test/VisualTest.tsx \
        apps/rialto-web/e2e/visual.spec.ts \
        apps/rialto-web/e2e/screenshots/light-master-override-variants.png
git commit -m "test(rialto-web): visual baseline for MasterOverride 3x3 variant grid"
```

---

## Task 5: MasterOverride — `master-override-requireHold-splitflap` section

**Files:**
- Modify: `apps/rialto-web/e2e/visual.spec.ts`
- Modify: `apps/rialto-web/src/pages/visual-test/VisualTest.tsx`
- Create: `apps/rialto-web/e2e/screenshots/light-master-override-requireHold-splitflap.png`

Captures the 0.1.11 features (requireHold + SplitFlap label) at rest. The progress ring won't be visible (no in-progress hold), but the SplitFlap cell will be.

- [ ] **Step 1: Add testid to lightSections array**

In `apps/rialto-web/e2e/visual.spec.ts`, append `"master-override-requireHold-splitflap",`:

```tsx
  "master-override-variants",
  "master-override-requireHold-splitflap",
] as const;
```

- [ ] **Step 2: Run — verify it fails**

```bash
pnpm --dir apps/rialto-web exec playwright test -g "master-override-requireHold-splitflap"
```

Expected: FAIL with locator timeout.

- [ ] **Step 3: Add the harness section**

In `apps/rialto-web/src/pages/visual-test/VisualTest.tsx`, immediately AFTER the `master-override-variants` Section, add:

```tsx
      {/* ── MasterOverride — requireHold + splitflap label ───────── */}
      <Section
        id="master-override-requireHold-splitflap"
        title="MasterOverride — requireHold + splitflap"
      >
        <div className={styles.card}>
          <MasterOverride
            label="System state"
            description="Hold to engage. Label cascades through SplitFlap cells."
            on={false}
            onChange={() => {}}
            size="md"
            variant="danger"
            idleLabel="OFFLINE"
            activeLabel="ONLINE"
            requireHold
            labelTransition="splitflap"
          />
        </div>
      </Section>
```

(Imports already include `MasterOverride` from Task 4 — no new imports needed.)

- [ ] **Step 4: Generate the baseline**

```bash
pnpm --dir apps/rialto-web exec playwright test -g "master-override-requireHold-splitflap" --update-snapshots
```

Expected: PASS. New file at `light-master-override-requireHold-splitflap.png`.

- [ ] **Step 5: Manually inspect**

Open the baseline. Confirm:
- One `md` `danger` MasterOverride.
- Cover is CLOSED (warning stripe pattern visible).
- Label "System state" above, description below.
- The component visually matches the 3×3 grid's `md`+`danger` cell — the `requireHold` and `labelTransition` props affect interaction and inner-component DOM but not the cover-closed appearance.

The progress ring is NOT visible because no hold is in progress (this is intentional — see spec for why mid-hold capture is out of scope).

- [ ] **Step 6: Re-run without update**

```bash
pnpm --dir apps/rialto-web exec playwright test -g "master-override-requireHold-splitflap"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/rialto-web/src/pages/visual-test/VisualTest.tsx \
        apps/rialto-web/e2e/visual.spec.ts \
        apps/rialto-web/e2e/screenshots/light-master-override-requireHold-splitflap.png
git commit -m "test(rialto-web): visual baseline for MasterOverride requireHold + splitflap"
```

---

## Task 6: Final verification

Run the full visual suite and confirm every section (existing + new) is green.

- [ ] **Step 1: Run the entire visual suite**

```bash
pnpm --dir apps/rialto-web exec playwright test --reporter=list
```

Expected: All tests PASS, including the 5 new ones (4 light + 1 dark) and all 41 pre-existing.

- [ ] **Step 2: If any pre-existing test fails**

That would mean adding the new sections changed page layout in a way that affected another section's screenshot (unlikely — the harness page just appends sections, it doesn't reflow). Investigate the diff:
```bash
ls apps/rialto-web/e2e/test-results/
```
Test results contain `*-actual.png` and `*-diff.png`. If the diff is genuinely a layout regression caused by your changes, fix the harness. If it's a pre-existing flake (font rendering crossed the threshold by chance), re-run that one test:
```bash
pnpm --dir apps/rialto-web exec playwright test -g "<failing-test-name>"
```

Don't blanket re-snapshot pre-existing tests — that defeats the regression check. Only update a baseline when you have intentionally changed what's visible.

- [ ] **Step 3: Verify total counts**

Check that the test runner reports the expected counts:
- Light tests: 33 (pre-existing) + 4 (new) = 37
- Dark tests: 8 (pre-existing) + 1 (new) = 9
- Total: 46 tests

If the count is off, a testid was added twice or removed accidentally.

---

## Self-Review Notes

1. **Spec coverage:**
   - Spec §"TapeChart sections (3)" → Tasks 1, 2, 3
   - Spec §"MasterOverride sections (2)" → Tasks 4, 5
   - Spec §"Determinism requirements" → Each task uses `startDate` ≥ 2026-01-15 (well in the past) + inline reservation lists (no RNG)
   - Spec §"Test stability" → Pre-existing `maxDiffPixelRatio: 0.01` covers all new tests; no per-test override needed
   - Spec §"Goal-backward verification" → Task 2 manual-inspection step explicitly verifies the bug class (no 2-rooms-per-row)

2. **Type consistency:** All `roomId`/`id`/`status` literal types match the `TapeChartReservation` and `TapeChartRoom` interfaces from `@mattbutlerengineering/rialto`. The fixture object types use `as const` to satisfy the `TapeChartStatus` and `TapeChartRoomStatus` literal unions.

3. **No placeholders:** Every step has the exact code, exact path, exact command, and concrete expectations. The "if you'd rather not risk it" note about `s-30` is a real branch (zero-night reservations may filter out), not a placeholder.

4. **Task self-containment:** Each of Tasks 1-5 is independently committable. Task 1 must run before Task 3 (Task 3 reuses `tapeChartDefaultRooms`/`tapeChartDefaultReservations`). Task 4 must run before Task 5 (Task 5 reuses the `MasterOverride` import). Otherwise no inter-task dependencies.

5. **Known-edge-case-not-handled:**
   - If the rialto package isn't built (`pnpm --dir packages/rialto build`), the `@mattbutlerengineering/rialto` workspace import won't resolve `MasterOverride` or `TapeChart`. Workspace consumers pick up source changes directly per CLAUDE.md, but the type definitions for new props (`requireHold`, `labelTransition`, `labelLength`) live in the built `.d.ts` files. If TypeScript errors during Step 3 of any task complain about unknown props, run `pnpm --dir packages/rialto build` first.
