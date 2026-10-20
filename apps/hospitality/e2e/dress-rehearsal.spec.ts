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
