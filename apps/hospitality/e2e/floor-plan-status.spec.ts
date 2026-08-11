/**
 * Real-time table status colors on the floor plan (#3803, part 5/5).
 *
 * Verifies that a table shape's rendered color updates when its
 * reservation's status transitions — driven via `useSSESync`'s
 * `table-status:changed` event (see `useTableStatuses` in
 * `src/hooks/useSSESync.tsx`), consumed by `FloorPlanCanvas` /
 * `TableShape` (`src/components/floor-plan/`).
 *
 * `TableShape` renders to a Konva `<canvas>`, not the DOM — there is no
 * element to assert a CSS color against. This spec samples the actual
 * rendered pixel at the table's center via `canvas.getContext("2d")
 * .getImageData()` instead, and compares it before/after the transition.
 *
 * Architecture limitation (same as `realtime-collaboration.spec.ts`):
 * `page.route()`'s `route.fulfill()` is a one-shot response, so the SSE
 * stream mock can't dynamically push a new event into an already-open
 * connection. This spec instead uses `page.reload()` to establish a fresh
 * connection whose `window.__fakeSSEConfig` (set via `addInitScript`, see
 * `api-mocks.ts`'s `**\/api/v1/events/stream` handler) carries the
 * transition event — the "before" and "after" states are two connections
 * to the same table, not one continuous session.
 *
 * The GET table-statuses resync snapshot (see `mockTableStatuses` below,
 * fetched on every `connected` transition — see `useTableStatuses`) is re-mocked
 * alongside the SSE event for each state so the snapshot and the live
 * delta always agree; leaving them out of sync would race exactly the
 * class of bug #3948 documents.
 */

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mockApi } from "./api-mocks.js";

// Mirrors CANVAS_WIDTH in src/components/floor-plan/floor-plan-geometry.ts.
const CANVAS_WIDTH = 800;

// tbl_e2e_001's shapeMetadata position (e2e/fixtures/tables-list.json /
// floor-plans-list.json) — TableShape centers the shape's Konva Group on
// this point regardless of shape/size, so it's a stable sample point.
const TABLE_CENTER = { x: 100, y: 100 };

const SSE_TIMEOUT_MS = 5_000; // matches realtime-collaboration.spec.ts's headroom

type Rgba = [number, number, number, number];

async function mockTableStatuses(page: Page, status: "available" | "seated"): Promise<void> {
  await page.route(/\/api\/v1\/venues\/[^/?]+\/table-statuses$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [{ tableId: "tbl_e2e_001", status }] }),
    })
  );
}

/** Reads the rendered pixel at TABLE_CENTER from the Konva scene canvas.
 * Skips Konva's off-screen hit-graph canvas (kept `display: none` unless a
 * drag interaction appends it) by picking the first visible <canvas>. */
async function sampleTableColor(page: Page): Promise<Rgba> {
  return page.evaluate(
    ({ x, y, canvasWidth }) => {
      const canvas = Array.from(document.querySelectorAll("canvas")).find(
        (c) => getComputedStyle(c).display !== "none"
      );
      if (!canvas) throw new Error("floor plan canvas not found");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width / canvasWidth;
      const pixelRatio = canvas.width / rect.width;
      const px = Math.round(x * scale * pixelRatio);
      const py = Math.round(y * scale * pixelRatio);
      const { data } = ctx.getImageData(px, py, 1, 1);
      return [data[0], data[1], data[2], data[3]] as [number, number, number, number];
    },
    { x: TABLE_CENTER.x, y: TABLE_CENTER.y, canvasWidth: CANVAS_WIDTH }
  );
}

test.describe("Floor plan: live table status colors (#3803)", () => {
  test("table shape re-colors when a table-status:changed event fires", async ({ page }) => {
    await mockApi(page);
    await mockTableStatuses(page, "available");
    await page.addInitScript(`window.__fakeSSEConfig = { events: [] };`);

    await page.goto("floor-plans/fp_e2e_001");
    await expect(page.getByRole("heading", { name: "Main Floor" })).toBeVisible();
    await expect(page.locator("canvas").first()).toBeVisible();

    // Wait for the canvas to actually paint the table fill (alpha > 0)
    // before sampling — Konva draws on the next animation frame, not
    // synchronously with React committing.
    let availableColor: Rgba = [0, 0, 0, 0];
    await expect
      .poll(
        async () => {
          availableColor = await sampleTableColor(page);
          return availableColor[3];
        },
        { timeout: SSE_TIMEOUT_MS }
      )
      .toBeGreaterThan(0);

    // "available" is rialto's success token — green-dominant in both themes
    // (light #5e6a2e, dark #9aaa4c): green channel exceeds red.
    expect(availableColor[1]).toBeGreaterThan(availableColor[0]);

    // Drive the transition: reservation moves into its seated window.
    // Re-mock the snapshot AND pre-configure the next connection's SSE
    // event so both agree (see file header) — then reload to reconnect.
    await mockTableStatuses(page, "seated");
    const sseEventPayload = {
      type: "table-status:changed",
      venueId: "ven_e2e_001",
      timestamp: new Date().toISOString(),
      data: [{ tableId: "tbl_e2e_001", status: "seated" }],
    };
    await page.addInitScript(
      `window.__fakeSSEConfig = { events: [{ type: "table-status:changed", data: ${JSON.stringify(sseEventPayload)} }] };`
    );

    await page.reload();
    await expect(page.getByRole("heading", { name: "Main Floor" })).toBeVisible();
    await expect(page.locator("canvas").first()).toBeVisible();

    await expect
      .poll(async () => sampleTableColor(page), { timeout: SSE_TIMEOUT_MS })
      .not.toEqual(availableColor);
    const seatedColor = await sampleTableColor(page);

    // "seated" is rialto's error token — red-dominant in both themes
    // (light #b84a3c, dark #e06050): red channel exceeds green, the
    // opposite of the "available" sample above.
    expect(seatedColor[0]).toBeGreaterThan(seatedColor[1]);
  });
});
