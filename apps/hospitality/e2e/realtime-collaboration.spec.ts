/**
 * Flow 10: Real-Time Collaboration — multi-user SSE sync
 *
 * Tests that a reservation created in one browser context becomes visible in a
 * second independent context via SSE — without a manual page reload.
 *
 * Architecture limitation and injection variant:
 * The mock fixture architecture (`api-mocks.ts`) uses `page.route()` to intercept
 * network requests. Playwright's `route.fulfill()` is a one-shot response, so the
 * SSE stream mock cannot dynamically push new events from outside the browser
 * process after the connection is established. True cross-process SSE would require
 * a real backend.
 *
 * This spec uses the SSE-event-injection variant:
 * - Context A performs a real walk-in via the existing dialog UI (API mock handles it).
 * - Context B's SSE route is pre-configured to deliver a `reservation:created` event
 *   immediately in the stream body, simulating reception of the broadcast that would
 *   come from the server in production.
 * - Context B's reservations API is configured to return the updated list (with the
 *   new walk-in) so the `invalidateReservations()` refetch triggered by the SSE event
 *   produces the correct result.
 * - The test asserts Context B reflects the new reservation without any reload,
 *   matching Flow 10's "events broadcast within 1 second" latency criterion.
 */

import { test as base, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { mockApi } from "./api-mocks.js";
import { readFileSync } from "fs";
import { join } from "path";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");

const SSE_TIMEOUT_MS = 5_000; // Flow 10 criterion: events broadcast within 1 second; 5s headroom for CI

/** New walk-in reservation injected via SSE into Context B. */
const WALKIN_RESERVATION = {
  id: "res_e2e_collab_walkin",
  date: new Date().toISOString().slice(0, 10),
  startTime: new Date().toISOString().replace(/T.*/, "T18:00:00.000Z"),
  endTime: new Date().toISOString().replace(/T.*/, "T19:30:00.000Z"),
  partySize: 2,
  status: "CONFIRMED",
  notes: "Walk-in",
  guestName: "Collab Test Guest",
  guestEmail: null,
  guestPhone: null,
  guestId: null,
  userId: null,
  tableId: "tbl_e2e_001",
  venueId: "ven_e2e_001",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  occasion: null,
  seatingPreference: null,
};

/** SSE stream body that delivers `connected` + `reservation:created` in one response. */
function buildSseStreamWithWalkin(): string {
  const connectedLine = 'data: {"type":"connected"}\n\n';
  const createdPayload = JSON.stringify({
    type: "reservation:created",
    venueId: "ven_e2e_001",
    timestamp: new Date().toISOString(),
    data: WALKIN_RESERVATION,
  });
  const createdLine = `event: reservation:created\ndata: ${createdPayload}\n\n`;
  return connectedLine + createdLine;
}

/** Reservations list fixture with the collab walk-in appended — returned after SSE invalidation. */
function buildUpdatedReservations(): string {
  const today = new Date().toISOString().slice(0, 10);
  const fixture = JSON.parse(
    readFileSync(join(FIXTURES_DIR, "reservations-list.json"), "utf-8")
  ) as { data: Array<Record<string, unknown>>; pagination: Record<string, unknown> };

  const updatedData = fixture.data
    .map((r) => ({
      ...r,
      date: today,
      startTime: String(r.startTime).replace(/^\d{4}-\d{2}-\d{2}/, today),
      endTime: String(r.endTime).replace(/^\d{4}-\d{2}-\d{2}/, today),
    }))
    .concat([{ ...WALKIN_RESERVATION }]);

  return JSON.stringify({
    ...fixture,
    data: updatedData,
    pagination: { ...fixture.pagination, total: updatedData.length },
  });
}

/**
 * Extend the base test with two independent BrowserContext fixtures.
 * Each context carries its own auth session (loaded from the shared storageState)
 * and its own route handlers, giving true isolation between "Host A" and "Host B".
 */
/* eslint-disable @eslint-react/rules-of-hooks, react-hooks/rules-of-hooks */
const test = base.extend<{
  contextA: BrowserContext;
  contextB: BrowserContext;
  pageA: Page;
  pageB: Page;
}>({
  contextA: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: "e2e/.auth/user.json",
    });
    await use(ctx);
    await ctx.close();
  },
  contextB: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: "e2e/.auth/user.json",
    });
    await use(ctx);
    await ctx.close();
  },
  pageA: async ({ contextA }, use) => {
    const page = await contextA.newPage();
    await mockApi(page);
    await page.goto("");
    await use(page);
  },
  pageB: async ({ contextB }, use) => {
    const page = await contextB.newPage();

    // Apply standard API mocks first, then override SSE + reservations for Context B.
    await mockApi(page);

    // Override SSE stream: deliver `reservation:created` event immediately,
    // simulating the broadcast triggered by Context A's walk-in.
    await page.route("**/api/v1/events/stream*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: buildSseStreamWithWalkin(),
      })
    );

    // Override reservations endpoint: return updated list (includes new walk-in)
    // so the query invalidation triggered by the SSE event fetches correct data.
    const updatedBody = buildUpdatedReservations();
    await page.route("**/api/v1/reservations?*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: updatedBody })
    );
    await page.route("**/api/v1/reservations/me*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: updatedBody })
    );

    await page.goto("");
    await use(page);
  },
});
/* eslint-enable @eslint-react/rules-of-hooks, react-hooks/rules-of-hooks */

test.describe("CF-10: Real-time collaboration across two sessions", () => {
  test("Context B receives SSE walk-in event and shows new reservation without reload", async ({
    pageA,
    pageB,
  }) => {
    // ── Context A: load timeline and record initial state ──────────────────────
    await pageA.goto("timeline");
    await expect(pageA.getByTestId("timeline-grid")).toBeVisible();

    const blocksA = pageA.getByTestId(/^reservation-block-/);
    const initialCountA = await blocksA.count();

    // ── Context A: create a walk-in (triggers API mutation) ───────────────────
    await pageA.getByRole("button", { name: /Walk.?In/i }).click();

    const dialog = pageA.getByRole("dialog", { name: /walk.?in/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "2" }).click();

    const guestNameInput = dialog.getByLabel(/guest name/i);
    if (await guestNameInput.isVisible()) {
      await guestNameInput.fill("Collab Test Guest");
    }

    await dialog.getByRole("button", { name: /seat now/i }).click();
    await expect(dialog).not.toBeVisible();

    // Context A should show one more reservation block (optimistic update)
    await expect(blocksA).toHaveCount(initialCountA + 1);

    // ── Context B: load timeline (SSE stream delivers event on connect) ────────
    await pageB.goto("timeline");
    await expect(pageB.getByTestId("timeline-grid")).toBeVisible();

    // Context B must show the new walk-in reservation injected via the SSE stream.
    // Uses locator wait — no sleep — matching the 1-second flow criterion with CI headroom.
    await expect(
      pageB.getByTestId(/^reservation-block-/).filter({ hasText: "Collab Test Guest" })
    ).toBeVisible({ timeout: SSE_TIMEOUT_MS });
  });

  test("Context B shows Live indicator when SSE stream delivers connected event", async ({
    pageB,
  }) => {
    await pageB.goto("timeline");
    // The SSE stream starts with a `data: {"type":"connected"}` event
    await expect(pageB.getByText("Live")).toBeVisible({ timeout: SSE_TIMEOUT_MS });
  });

  test("Context A and Context B both load the timeline grid independently", async ({
    pageA,
    pageB,
  }) => {
    await Promise.all([pageA.goto("timeline"), pageB.goto("timeline")]);

    await expect(pageA.getByTestId("timeline-grid")).toBeVisible();
    await expect(pageB.getByTestId("timeline-grid")).toBeVisible();

    // Each context is independent: both show the timeline without interfering
    const countA = await pageA.getByTestId(/^reservation-block-/).count();
    const countB = await pageB.getByTestId(/^reservation-block-/).count();

    // Context B has one extra reservation (the SSE-injected walk-in)
    expect(countB).toBeGreaterThan(countA);
  });
});
