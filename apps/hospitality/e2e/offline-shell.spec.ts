/**
 * Offline-first shell E2E (#4189, part 5/5 of the hospitality
 * offline-first-shell feature — parent proposal #4098).
 *
 * Proves the shell built by #4185-#4188 actually works end-to-end: load the
 * timeline + floor plan online (priming both IndexedDB caches — see
 * `src/lib/offline-cache.ts`), force the reservations list and
 * table-statuses REST calls to fail, and confirm both pages keep rendering
 * last-known state with `offline-banner` / `floor-plan-stale-indicator`
 * visible. Then re-arm the mocks with fresh data and confirm both
 * indicators clear and the fresh data renders.
 *
 * Design notes (see also `.claude/rules/gotchas.md` and the PR body):
 *
 * 1. `context.setOffline(true)` does not, by itself, fail the app's own
 *    fetches here: `page.route()`-mocked requests are served entirely by
 *    Playwright's routing layer and are never handed to the real network
 *    stack, so `setOffline` has no effect on them (verified empirically —
 *    a routed fetch still resolves under `setOffline(true)`). It DOES still
 *    block any genuinely unmocked request (e.g. a full page navigation's
 *    document/asset fetches against the real Vite dev server). The one
 *    `page.reload()` this spec performs (Phase 2, see note 2) therefore
 *    happens BEFORE `context.setOffline(true)` is set — reload first, then
 *    go offline once the reload has settled — everything else is
 *    SPA-internal client-side navigation (sidebar nav buttons, the
 *    floor-plan card), which issues no new document/asset request and is
 *    safe under `setOffline(true)`. The genuine failures that drive the
 *    cached-view assertions come from failing the two REST endpoints with
 *    an explicit 500 (see `failReservations` — a `route.abort()` is retried
 *    by `@mbe/api-client` for ~7s and never surfaces inside the assertion
 *    window); `context.setOffline()` is still called for semantic fidelity
 *    to the scenario ("the device went offline") and because it's what the
 *    issue asks for, but the deterministic mechanism is the forced 500.
 *
 * 2. The banner/indicator condition is `isFromCache || !isConnected`
 *    (`TimelinePage`) / `isStale` (`FloorPlanCanvas`, itself
 *    `!isConnected || syncedEpoch !== connectionEpoch` — see
 *    `useTableStatuses` in `src/hooks/useSSESync.tsx`). This spec never
 *    disconnects the mocked SSE stream (`isConnected` stays `true`
 *    throughout) and instead genuinely exercises the `isFromCache`/
 *    `syncedEpoch!==connectionEpoch` halves. react-query's `staleTime` is
 *    `30_000` (`src/providers/QueryProvider.tsx`), so a mere SPA-nav
 *    unmount+remount is NOT enough to force a refetch of `useReservations`'s
 *    still-fresh Phase 1 query — it would keep serving Phase 1's data
 *    straight out of the in-memory `QueryClient` without ever touching the
 *    aborted route. Phase 2 instead uses `page.reload()`, which discards the
 *    `QueryClient` entirely, forcing a genuine (and, thanks to the abort
 *    above, genuinely failing) fetch — that's what makes `useReservations`
 *    read its IndexedDB fallback and return `isFromCache: true`.
 *    `useTableStatuses` is plain `useState`/`useEffect`, not react-query, so
 *    it has no such staleTime gate — its own component state genuinely
 *    resets on the `FloorPlanEditorPage` unmount/remount (SPA nav is enough
 *    there), and it computes `isStale: true` because the fresh fetch never
 *    advanced `syncedEpoch`. A second, isolated test below (`SSE
 *    disconnected...`) exercises the `!isConnected` half on its own, with
 *    reservations fetching successfully, so both halves of the OR are
 *    independently proven rather than only ever co-occurring.
 *
 * 3. Cache priming is awaited deterministically by polling the real
 *    IndexedDB store (`readCachedReservationsCount`/
 *    `readCachedFloorPlanSnapshotSize` below) via `expect.poll`, not an
 *    arbitrary `waitForTimeout` — see `src/lib/offline-cache.ts` for the
 *    schema (`mbe-hospitality-offline`, stores `reservations` and
 *    `floorPlanSnapshots`) being polled.
 *
 * 4. This spec deliberately never sends a `table-status:changed` SSE event
 *    while offline — #4216 documents a real, separate defect in
 *    `useTableStatuses`'s cache-fallback merge when a live delta arrives
 *    during that window, and reproducing that defect here would couple an
 *    unrelated bug to this feature's own test.
 */

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mockApi } from "./api-mocks.js";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const VENUE_ID = "ven_e2e_001";
const POLL_TIMEOUT_MS = 10_000;

interface ReservationRecord {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  guestName: string;
  [key: string]: unknown;
}

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf-8")) as T;
}

/** Re-dates the reservations fixture to today (the app filters client-side
 * on `reservation.date === selectedDate`, and `selectedDate` defaults to
 * today) — mirrors `api-mocks.ts`'s private `todayReservations()`, which
 * isn't exported. Optionally overrides `res_e2e_001`'s `guestName` so the
 * reconnect phase can prove *fresh* data rendered, not merely "not the
 * cache-fallback error state". */
function todayReservationsBody(guestNameOverride?: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const fixture = loadFixture<{ data: ReservationRecord[]; pagination: unknown }>(
    "reservations-list"
  );
  return JSON.stringify({
    ...fixture,
    data: fixture.data.map((r) => ({
      ...r,
      date: today,
      startTime: r.startTime.replace(/^\d{4}-\d{2}-\d{2}/, today),
      endTime: r.endTime.replace(/^\d{4}-\d{2}-\d{2}/, today),
      ...(r.id === "res_e2e_001" && guestNameOverride ? { guestName: guestNameOverride } : {}),
    })),
  });
}

async function mockReservationsSuccess(page: Page, guestNameOverride?: string): Promise<void> {
  await page.route("**/api/v1/reservations?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: todayReservationsBody(guestNameOverride),
    })
  );
}

/** Fails the reservations list with a 500 — NOT `route.abort()`. `@mbe/api-client`
 * retries any `TypeError` (which is what an aborted fetch surfaces as) 3x with
 * exponential backoff (1s/2s/4s, `BASE_BACKOFF_MS` in `packages/api-client/src/client.ts`),
 * and `window.__e2eNoRetry` only disables react-query's retries, not that layer's. An
 * aborted request therefore stays pending ~7s — past Playwright's 5s expect timeout — so
 * the query never reaches the error state that drives the cache fallback. 500 is absent
 * from `RETRYABLE_STATUS_CODES` (502/503/504 only), so it surfaces immediately. Same
 * reason `dashboard.spec.ts`'s error-state test uses a 500. */
async function failReservations(page: Page): Promise<void> {
  await page.route("**/api/v1/reservations?*", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":"offline"}',
    })
  );
}

async function mockTableStatusesSuccess(page: Page, status: "available" | "seated"): Promise<void> {
  await page.route(/\/api\/v1\/venues\/[^/?]+\/table-statuses$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [{ tableId: "tbl_e2e_001", status }] }),
    })
  );
}

/** Fails the table-statuses snapshot with a 500, for the same reason as
 * `failReservations` above — `useTableStatuses` fetches through the same
 * retrying `@mbe/api-client`. */
async function failTableStatuses(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/venues\/[^/?]+\/table-statuses$/, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":"offline"}',
    })
  );
}

/** Reads a value straight out of the app's own IndexedDB cache
 * (`mbe-hospitality-offline`, see `src/lib/offline-cache.ts`) so cache
 * priming can be awaited deterministically instead of via a timeout. The
 * `onupgradeneeded` handler mirrors `offline-cache.ts`'s schema so this is
 * safe to call before the app has ever opened the DB itself (the store
 * simply reads back empty until the app's own write lands, and
 * `expect.poll` keeps retrying). */
async function readOfflineCacheStore<T>(
  page: Page,
  storeName: "reservations" | "floorPlanSnapshots",
  key: string
): Promise<T | undefined> {
  return page.evaluate(
    ({ storeName, key }) =>
      new Promise<unknown>((resolve, reject) => {
        const req = indexedDB.open("mbe-hospitality-offline", 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("reservations")) db.createObjectStore("reservations");
          if (!db.objectStoreNames.contains("floorPlanSnapshots")) {
            db.createObjectStore("floorPlanSnapshots");
          }
        };
        req.onerror = () => reject(req.error as Error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, "readonly");
          const getReq = tx.objectStore(storeName).get(key);
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result);
          };
          getReq.onerror = () => {
            db.close();
            reject(getReq.error as Error);
          };
        };
      }),
    { storeName, key }
  ) as Promise<T | undefined>;
}

function reservationsCacheKey(): string {
  // Matches `TimelinePage`'s default `selectedDate` (`en-CA` locale format,
  // same YYYY-MM-DD shape `useReservations`'s `fallbackKey` keys on).
  return `${VENUE_ID}::${new Date().toLocaleDateString("en-CA")}`;
}

async function waitForReservationsCached(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const entry = await readOfflineCacheStore<{ reservations: unknown[] }>(
          page,
          "reservations",
          reservationsCacheKey()
        );
        return entry?.reservations.length ?? 0;
      },
      { timeout: POLL_TIMEOUT_MS }
    )
    .toBeGreaterThan(0);
}

async function waitForFloorPlanSnapshotCached(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const entry = await readOfflineCacheStore<{ snapshot: unknown[] }>(
          page,
          "floorPlanSnapshots",
          VENUE_ID
        );
        return entry?.snapshot.length ?? 0;
      },
      { timeout: POLL_TIMEOUT_MS }
    )
    .toBeGreaterThan(0);
}

/** SPA-internal navigation only — never `page.reload()`/`page.goto()` while
 * `context.setOffline(true)` is active (see file header, note 1). */
async function navigateToTimeline(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByTestId("dashboard-layout")).toBeVisible();
}

async function navigateToFloorPlanEditor(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Floor Plans", exact: true }).click();
  await page.getByRole("button", { name: "Open floor plan: Main Floor" }).click();
  await expect(page.getByRole("heading", { name: "Main Floor" })).toBeVisible();
}

test.describe("Offline-first shell (#4189)", () => {
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("cached floor plan + timeline render while offline, then resume live data on reconnect", async ({
    page,
    context,
  }) => {
    await mockApi(page);
    await mockTableStatusesSuccess(page, "available");
    await page.addInitScript(`window.__fakeSSEConfig = { events: [] };`);

    // ── Phase 1: online — prime both caches ──────────────────────────
    await page.goto("timeline");
    await expect(page.getByTestId("reservation-block-res_e2e_001")).toContainText("Alice Johnson");
    await expect(page.getByTestId("offline-banner")).toHaveCount(0);
    await waitForReservationsCached(page);

    await navigateToFloorPlanEditor(page);
    await expect(page.getByTestId("floor-plan-stale-indicator")).toHaveCount(0);
    await waitForFloorPlanSnapshotCached(page);

    // ── Phase 2: offline — cached data must still render ─────────────
    await failReservations(page);
    await failTableStatuses(page);

    // Navigate to Timeline, then reload — see file header note 2 for why a
    // plain SPA-nav remount can't force `useReservations` to hit the
    // (aborted) network. `context.setOffline(true)` is deferred until after
    // the reload settles: setting it before the reload would also block the
    // reload's own unmocked document/asset requests (file header note 1).
    await navigateToTimeline(page);
    await page.reload();
    await expect(page.getByTestId("offline-banner")).toBeVisible();
    await expect(page.getByTestId("reservation-block-res_e2e_001")).toContainText("Alice Johnson");
    await context.setOffline(true);

    await navigateToFloorPlanEditor(page);
    await expect(page.getByTestId("floor-plan-stale-indicator")).toBeVisible();
    // The table itself (from the `floor-plans-list`/`tables-list` fixtures,
    // always mocked-successful) keeps rendering regardless of status data.
    await expect(page.locator("canvas").first()).toBeVisible();

    // ── Phase 3: reconnect — fresh data resumes, indicators clear ────
    await context.setOffline(false);
    await mockReservationsSuccess(page, "Alice Johnson (Live)");
    await mockTableStatusesSuccess(page, "available");

    await navigateToTimeline(page);
    await expect(page.getByTestId("offline-banner")).toBeHidden();
    await expect(page.getByTestId("reservation-block-res_e2e_001")).toContainText(
      "Alice Johnson (Live)"
    );

    await navigateToFloorPlanEditor(page);
    await expect(page.getByTestId("floor-plan-stale-indicator")).toBeHidden();
  });

  test("SSE disconnected alone shows the offline banner, independent of the cache-fallback path", async ({
    page,
  }) => {
    // Isolated check for the `!isConnected` half of TimelinePage's
    // `isFromCache || !isConnected` condition (see file header, note 2) —
    // reservations fetch succeeds normally, proving the banner isn't only
    // ever reachable via a failed/cached fetch.
    await mockApi(page);
    await mockReservationsSuccess(page);
    await page.route("**/api/v1/events/stream**", (route) => route.abort());

    await page.goto("timeline");

    await expect(page.getByTestId("offline-banner")).toBeVisible();
    await expect(page.getByTestId("reservation-block-res_e2e_001")).toContainText("Alice Johnson");
  });
});
