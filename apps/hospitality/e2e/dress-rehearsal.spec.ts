import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";

/**
 * Dress rehearsal: a simulated Friday night on the owner's own floor plan (docs/features/
 * dress-rehearsal). Everything is client-side, so these specs also pin the property that matters
 * most: the rehearsal never writes.
 */

const PAGINATION = (total: number) => ({
  page: 1,
  limit: 100,
  total,
  totalPages: 1,
  hasNext: false,
  hasPrev: false,
});

const EMPTY_RESERVATIONS_BODY = JSON.stringify({ data: [], pagination: PAGINATION(0) });

/** The mocked venue starts the night with no reservations, so the timeline shows its quiet night. */
async function emptyTheBook(page: Page): Promise<void> {
  await page.route("**/api/v1/reservations?*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: EMPTY_RESERVATIONS_BODY })
  );
}

async function startFridayRehearsal(page: Page): Promise<void> {
  await page.goto("timeline");
  const quietNight = page.getByTestId("timeline-empty-night");
  await expect(quietNight).toBeVisible();
  await quietNight.getByRole("button", { name: "Run a Friday night", exact: true }).click();
  await expect(page).toHaveURL(/\/rehearsal$/);
  await expect(page.getByTestId("rehearsal-workspace")).toBeVisible();
}

/** A large room, to exercise the 240x render budget (architecture.md "Performance budget" item 2). */
const LARGE_ROOM_SIZE = 80;
const FLOOR_PLAN_ID = "fp_e2e_001";
const VENUE_ID = "ven_e2e_001";

function largeRoom(): Array<Record<string, unknown>> {
  return Array.from({ length: LARGE_ROOM_SIZE }, (_, index) => {
    const capacity = index % 4 === 0 ? 6 : index % 4 === 1 ? 2 : 4;
    return {
      id: `tbl_perf_${String(index).padStart(3, "0")}`,
      name: `Table ${index + 1}`,
      tableNumber: String(index + 1),
      capacity,
      minCovers: capacity === 2 ? 1 : 2,
      maxCovers: capacity,
      location: "Main Floor",
      isActive: true,
      priority: index,
      status: "AVAILABLE",
      venueId: VENUE_ID,
      floorPlanId: FLOOR_PLAN_ID,
      shapeMetadata: {
        x: 60 + (index % 10) * 70,
        y: 60 + Math.floor(index / 10) * 60,
        width: 50,
        height: 50,
        shape: "square",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  });
}

async function serveLargeRoom(page: Page): Promise<void> {
  const tables = largeRoom();
  await page.route("**/api/v1/tables?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: tables, pagination: PAGINATION(tables.length) }),
    })
  );
  await page.route("**/api/v1/floor-plans?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: FLOOR_PLAN_ID,
            venueId: VENUE_ID,
            name: "Main Floor",
            isActive: true,
            layoutJson: { width: 800, height: 600, gridSize: 20, showGrid: true },
            tables,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        pagination: PAGINATION(1),
      }),
    })
  );
}

/** Every request that could change server state: each non-GET to the app's own API. */
function trackWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    const isApi = pathname.startsWith("/api/") || pathname.startsWith("/public/");
    if (isApi && request.method() !== "GET") writes.push(`${request.method()} ${pathname}`);
  });
  return writes;
}

/** Simulated minutes from midnight, scrubbed to through the slider's own input. */
const FRIDAY_SAMPLE_MINUTES = [1110, 1140, 1170, 1200, 1230, 1260, 1290];

const scrubber = (page: Page) =>
  page.getByRole("slider", { name: "Scrub through the night", exact: true });

async function scrubTo(page: Page, minute: number): Promise<void> {
  await scrubber(page).fill(String(minute), { force: true });
}

/** Finds a minute of the night with at least one table occupied; the seed is random per run. */
async function scrubToABusyMinute(page: Page): Promise<void> {
  const rightNow = page.getByTestId("rehearsal-right-now");
  for (const minute of FRIDAY_SAMPLE_MINUTES) {
    await scrubTo(page, minute);
    const text = (await rightNow.textContent()) ?? "";
    if (/\b[1-9]\d* tables? occupied/.test(text)) return;
  }
  throw new Error("no sampled minute of the simulated night had an occupied table");
}

const MEASURE_MS = 10_000;
const MEDIAN_FRAME_BUDGET_MS = 50;
const LONG_TASK_BUDGET_MS = 200;

interface RenderSample {
  readonly frameIntervals: number[];
  readonly longTasks: number[];
}

/** Collects animation-frame intervals and long tasks for `durationMs` of real time. */
function sampleRender(page: Page, durationMs: number): Promise<RenderSample> {
  return page.evaluate(
    (ms) =>
      new Promise<RenderSample>((resolve) => {
        const frameIntervals: number[] = [];
        const longTasks: number[] = [];
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push(entry.duration);
        });
        observer.observe({ type: "longtask", buffered: false });
        const started = performance.now();
        let last = started;
        const tick = (now: number) => {
          frameIntervals.push(now - last);
          last = now;
          if (now - started < ms) requestAnimationFrame(tick);
          else {
            observer.disconnect();
            resolve({ frameIntervals, longTasks });
          }
        };
        requestAnimationFrame(tick);
      }),
    durationMs
  );
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

test.describe("Dress rehearsal render budget (SC-12, advisory)", () => {
  // The hospitality E2E job is advisory and CI runners are slow, so a miss warns and annotates
  // rather than fails. The hard gate is the compute budget in rehearsal-performance.test.ts.
  test("240x on an 80-table room: frame interval and long tasks stay inside budget", async ({
    mockedPage,
  }) => {
    test.setTimeout(MEASURE_MS + 45_000);
    await emptyTheBook(mockedPage);
    await serveLargeRoom(mockedPage);
    await startFridayRehearsal(mockedPage);

    await mockedPage.getByRole("radio", { name: "240x", exact: true }).click();
    const sample = await sampleRender(mockedPage, MEASURE_MS);

    const medianFrame = median(sample.frameIntervals);
    const worstTask = Math.max(0, ...sample.longTasks);
    const misses: string[] = [];
    if (medianFrame > MEDIAN_FRAME_BUDGET_MS) {
      misses.push(`median frame ${medianFrame.toFixed(1)} ms > ${MEDIAN_FRAME_BUDGET_MS} ms`);
    }
    if (worstTask > LONG_TASK_BUDGET_MS) {
      misses.push(`long task ${worstTask.toFixed(0)} ms > ${LONG_TASK_BUDGET_MS} ms`);
    }
    test.info().annotations.push({
      type: "render-budget",
      description: `median frame ${medianFrame.toFixed(1)} ms, worst long task ${worstTask.toFixed(0)} ms over ${sample.frameIntervals.length} frames`,
    });
    if (misses.length > 0) {
      console.warn(`dress-rehearsal render budget missed (advisory): ${misses.join("; ")}`);
      test
        .info()
        .annotations.push({ type: "render-budget-warning", description: misses.join("; ") });
    }
    // The page must still be a working rehearsal after the measurement, whatever the numbers said.
    await expect(mockedPage.getByTestId("rehearsal-workspace")).toBeVisible();
  });
});

test.describe("Dress rehearsal flow (SC-6)", () => {
  test("a fresh venue runs a Friday night to the curtain call without a single API write", async ({
    mockedPage,
  }) => {
    await emptyTheBook(mockedPage);
    const writes = trackWrites(mockedPage);
    await startFridayRehearsal(mockedPage);

    // Freeze the clock so the assertions below read one moment of the night.
    await mockedPage.getByRole("button", { name: "Pause", exact: true }).click();
    await scrubToABusyMinute(mockedPage);

    // Reservations on the timeline, drawn from the owner's own tables.
    await expect(mockedPage.getByTestId(/^reservation-block-rehearsal-/).first()).toBeVisible();
    await expect(mockedPage.getByTestId("table-row-tbl_e2e_001")).toBeVisible();

    // Occupied tables on the floor plan.
    await mockedPage.getByRole("radio", { name: "Floor plan", exact: true }).click();
    await expect(
      mockedPage.getByRole("img", { name: /^[1-9]\d* tables? occupied\./ })
    ).toBeVisible();

    // The end of the night opens the curtain call.
    await scrubber(mockedPage).focus();
    await scrubber(mockedPage).press("End");
    const curtain = mockedPage.getByRole("dialog", { name: "Your Friday night", exact: true });
    await expect(curtain).toBeVisible();
    await expect(curtain.getByText("Covers served", { exact: true })).toBeVisible();
    await expect(curtain.getByText("This was a rehearsal. Nothing was saved.")).toBeVisible();

    // Run it again starts a new night at opening time.
    await curtain.getByRole("button", { name: "Run it again", exact: true }).click();
    await expect(curtain).toHaveCount(0);
    await expect(mockedPage).toHaveURL(/\/rehearsal$/);
    await expect(mockedPage.getByRole("heading", { name: /^Friday night · / })).toBeVisible();

    expect(writes, "the rehearsal must not write").toEqual([]);
  });

  test("both views wear the rehearsal banner, and a simulated booking cannot be acted on", async ({
    mockedPage,
  }) => {
    await emptyTheBook(mockedPage);
    const writes = trackWrites(mockedPage);
    await startFridayRehearsal(mockedPage);
    await mockedPage.getByRole("button", { name: "Pause", exact: true }).click();

    const banner = mockedPage.getByRole("note", { name: "Rehearsal notice", exact: true });
    await expect(banner).toContainText("Rehearsal, not real bookings. Nothing here is saved.");
    await scrubToABusyMinute(mockedPage);

    const block = mockedPage.getByTestId(/^reservation-block-rehearsal-/).first();
    await block.click({ force: true });
    await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
    await expect(mockedPage).toHaveURL(/\/rehearsal$/);

    await mockedPage.getByRole("radio", { name: "Floor plan", exact: true }).click();
    await expect(banner).toBeVisible();
    await mockedPage.getByRole("radio", { name: "Timeline", exact: true }).click();
    await expect(banner).toBeVisible();

    expect(writes, "the rehearsal must not write").toEqual([]);
  });
});

test.describe("Dress rehearsal with reduced motion (SC-11)", () => {
  test("starts paused at opening time and steps through the night event by event", async ({
    mockedPage,
  }) => {
    await mockedPage.emulateMedia({ reducedMotion: "reduce" });
    await emptyTheBook(mockedPage);
    await startFridayRehearsal(mockedPage);

    await expect(
      mockedPage.getByText("Motion is reduced. Step through the night with Next event.", {
        exact: true,
      })
    ).toBeVisible();
    await expect(mockedPage.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect(mockedPage.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
    await expect(mockedPage.getByRole("radiogroup", { name: "Playback speed" })).toHaveCount(0);

    const live = mockedPage.getByTestId("rehearsal-live-region");
    await mockedPage.getByRole("button", { name: "Next event", exact: true }).click();
    await expect(live).toContainText(/Party of \d/);
    // Stepping back lands on an earlier event; the live region always says what is there.
    await mockedPage.getByRole("button", { name: "Previous event", exact: true }).click();
    await expect(live).not.toBeEmpty();
  });
});
