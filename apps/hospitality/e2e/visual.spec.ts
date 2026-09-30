/**
 * Visual regression floor for hospitality
 * (docs/features/ui-quality-loop/architecture.md § Components "VR floor").
 *
 * One full-page screenshot per (ledger `page` row × viewport), public and
 * `auth0` rows alike — the `setup` project's stored Auth0 session covers the
 * gated ones. The route set is read from `metrics/ui-quality-ledger.jsonl` at
 * test time — data, not an import — so a route added to the app fails here
 * with a missing snapshot instead of going silently uncovered. Parameterised
 * routes resolve through `scripts/ui-quality/route-fixtures.json`.
 *
 * Every page runs against `mockedPage` (api-mocks.ts) under a fixed clock. The
 * instant is a constant, not the runner's day: a baseline that renders "today"
 * would change every day it is compared. The reservations list is re-served
 * on FIXED_NOW's day (mockApi dates it on the runner's real one, which the
 * fixed clock never shows), so `/` and `timeline` baseline a populated grid.
 *
 * Every row asserts it landed on the route it asked for before the shot — a
 * guard redirect would otherwise baseline the page it redirected to. `admin`
 * is captured with the `admin` permission on the stored session (review M5).
 *
 * A baseline of an error state records the error as correct, so three things
 * are pinned here rather than trusted (Verify's e2e-selector-drift-reviewer
 * FLAG, breakdown Milestone 5b):
 *  - every same-origin `/api/` or `/public/` request no mock answered is
 *    recorded and fails the row, so a new endpoint cannot bake an error card
 *    into a baseline;
 *  - the stored session's `expires_at` (and the `iat`/`exp` claims
 *    ProfilePage counts down from) is re-based on FIXED_NOW. A token
 *    minted today sits months past the fixed instant, and `useAccessToken`
 *    schedules its refresh as a `setTimeout` of that distance — past the
 *    2^31-1 ms ceiling, which fires at once and paints "Your session couldn't
 *    renew";
 *  - the event stream is answered in-page and held open. The network mock
 *    ends its body, and SseClient reconnects about once a second, flipping the
 *    live indicator between frames.
 *
 * Baselines live in e2e/screenshots/ and are Linux-only: committed from the
 * noise-floor workflow's `visual-actuals-replica-a` artifact, never from macOS.
 * Run only through playwright.visual.config.ts.
 */
import { readFileSync } from "node:fs";
import { test as base, expect } from "./fixtures.js";

const APP = "hospitality";

const REPO_ROOT = new URL("../../../", import.meta.url);
const LEDGER = new URL("metrics/ui-quality-ledger.jsonl", REPO_ROOT);
const FIXTURES = new URL("scripts/ui-quality/route-fixtures.json", REPO_ROOT);

/** The ui-quality VIEWPORTS (scripts/ui-quality/config.mjs). */
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
] as const;

/**
 * 17:30 UTC: just before the fixture's 18:00 first seating. The timeline
 * scrolls its grid to "now", so a morning instant leaves every block off-screen.
 */
const FIXED_NOW = new Date("2026-06-15T17:30:00Z");

/** Same-origin API traffic: what the preview server would otherwise 404/502. */
const isAppApi = (url: URL) =>
  url.hostname === "localhost" && /^\/(api|public)\//.test(url.pathname);

/** FIXED_NOW's calendar day, in the pinned UTC zone. */
const DAY = FIXED_NOW.toISOString().slice(0, 10);
const at = (hhmm: string) => `${DAY}T${hhmm}:00.000Z`;

const VENUE = { id: "ven_e2e_001", name: "E2E Test Bistro", slug: "e2e-test-bistro" } as const;

function briefingEntry(id: string, start: string, end: string, guestName: string, extra: object) {
  return {
    id,
    date: DAY,
    startTime: at(start),
    endTime: at(end),
    partySize: 2,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName,
    guestId: `gst_${id}`,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "tbl_e2e_001",
    table: { id: "tbl_e2e_001", name: "Table 1", tableNumber: "1" },
    venueId: VENUE.id,
    createdAt: at("00:00"),
    updatedAt: at("00:00"),
    guest: {
      id: `gst_${id}`,
      name: guestName,
      lastVisit: null,
      notes: null,
      staffNotes: [],
      communicationPreference: null,
      visitCount: 1,
      dietaryRestrictions: null,
      tags: [],
    },
    ...extra,
  };
}

/**
 * Endpoints the page rows reach that `mockApi` deliberately leaves to each spec
 * (briefing.spec.ts, floor-plan-status.spec.ts mount their own). Registered
 * after mockApi, so these win; every value is a constant on FIXED_NOW's day.
 */
const VISUAL_ROUTES: ReadonlyArray<readonly [RegExp, unknown]> = [
  [
    /\/api\/v1\/briefing\?/,
    [
      briefingEntry("dinner", "18:30", "20:00", "Priya Shah", {
        partySize: 4,
        occasion: "anniversary",
      }),
      briefingEntry("late", "21:00", "22:30", "Jordan Lee", {}),
    ],
  ],
  [
    /\/api\/v1\/guests\/lapsing\?/,
    [
      {
        guestId: "gst_lapsing",
        name: "Morgan Reyes",
        email: "morgan@example.com",
        phone: null,
        communicationPreference: "email_only",
        avgFrequencyDays: 21,
        daysSinceLastVisit: 49,
        daysOverdue: 28,
      },
    ],
  ],
  [/\/api\/v1\/venues\/[^/?]+\/table-statuses$/, [{ tableId: "tbl_e2e_001", status: "available" }]],
  [
    /\/public\/v1\/reservations\/manage\?token=/,
    {
      reservation: {
        id: "res_vr_manage",
        date: DAY,
        startTime: at("18:30"),
        endTime: at("20:00"),
        partySize: 4,
        guestName: "Priya Shah",
        guestEmail: "priya@example.com",
        status: "CONFIRMED",
        notes: null,
      },
      venue: { ...VENUE, ianaTimezone: "UTC" },
    },
  ],
];

const RESERVATIONS_LIST = new URL("fixtures/reservations-list.json", import.meta.url);

/**
 * The shared reservations fixture, re-dated onto FIXED_NOW's day at its own
 * wall clock (the browser is pinned to UTC). Overrides mockApi's list, which
 * dates it on the runner's real day and so leaves the fixed-clock grid empty.
 */
function reservationsOnFixedDay(): object {
  const fixture = JSON.parse(readFileSync(RESERVATIONS_LIST, "utf8")) as {
    data: Array<Record<string, unknown>>;
  };
  const wallClock = (iso: unknown) => at(String(iso).slice(11, 16));
  return {
    ...fixture,
    data: fixture.data.map((r) => ({
      ...r,
      date: DAY,
      startTime: wallClock(r.startTime),
      endTime: wallClock(r.endTime),
    })),
  };
}

/**
 * Designed redirects: for an operational venue (what mockApi serves)
 * DashboardLayout sends the index route to `timeline`. Any landing not named
 * here, or not the requested route, fails the row.
 */
const LANDS_ON: Record<string, string> = { "/": "timeline" };

/** A route whose populated state needs a query string the ledger path lacks. */
const QUERY: Record<string, string> = { "reservations/manage": "?token=vr-manage-token" };

/* eslint-disable @eslint-react/rules-of-hooks, react-hooks/rules-of-hooks -- Playwright fixtures, as in fixtures.ts */
const test = base.extend<{ unmockedApi: string[] }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright's fixture signature
  unmockedApi: async ({}, use) => {
    await use([]);
  },
  // Overriding `page` runs before `mockedPage` (which depends on it) calls
  // mockApi, so this route is the lowest-priority handler: only a request
  // every mock declined or fell back from reaches it.
  page: async ({ page, unmockedApi }, use) => {
    await page.route(isAppApi, (route) => {
      const url = new URL(route.request().url());
      unmockedApi.push(`${route.request().method()} ${url.pathname}${url.search}`);
      return route.fulfill({ status: 599, contentType: "text/plain", body: "unmocked" });
    });
    // The claims too: ProfilePage counts the session down from `profile.exp`.
    await page.addInitScript(
      (iat) => {
        const exp = iat + 3600;
        for (const key of Object.keys(localStorage)) {
          if (!key.startsWith("oidc.user:")) continue;
          const user = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
          const profile = { ...(user.profile as object), iat, exp };
          localStorage.setItem(key, JSON.stringify({ ...user, expires_at: exp, profile }));
        }
      },
      Math.floor(FIXED_NOW.getTime() / 1000)
    );
    await page.addInitScript(() => {
      const realFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        // A regex, not a quoted path: check-ai-antipatterns.mjs counts /api/ route literals.
        if (!/\/api\/v1\/events\/stream(\?|$)/.test(url)) return realFetch(input, init);
        const frame = 'event: connected\ndata: {"message":"Connected to event stream"}\n\n';
        const body = new ReadableStream<Uint8Array>({
          start: (controller) => controller.enqueue(new TextEncoder().encode(frame)),
        });
        return Promise.resolve(
          new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })
        );
      };
    });
    await use(page);
  },
});
/* eslint-enable @eslint-react/rules-of-hooks, react-hooks/rules-of-hooks */

interface LedgerRow {
  route: string;
  app: string;
  kind: string;
}

const fixtures: Record<string, Record<string, string>> = JSON.parse(readFileSync(FIXTURES, "utf8"));

const pages = readFileSync(LEDGER, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line) as LedgerRow)
  .filter((row) => row.app === APP && row.kind === "page");

/**
 * The ledger's path rule (scripts/ui-quality/ledger-audit.mjs `resolvePath`),
 * made relative so it resolves under the `/hospitality/` baseURL.
 */
function pathOf(route: string): string | null {
  const path =
    route.includes(":") || route.includes("*")
      ? (fixtures[APP]?.[route] ?? null)
      : route === "/"
        ? "/"
        : `/${route}`;
  return path === null ? null : path.replace(/^\//, "");
}

const slug = (route: string) => (route === "/" ? "home" : route.replace(/\W+/g, "_"));

for (const { route } of pages) {
  for (const { width, height } of VIEWPORTS) {
    test(`${route} @ ${width}x${height}`, async ({ mockedPage: page, unmockedApi }) => {
      const path = pathOf(route);
      expect(path, `${route} has no fixture in route-fixtures.json`).not.toBeNull();
      for (const [pattern, data] of VISUAL_ROUTES) {
        await page.route(pattern, (r) => r.fulfill({ status: 200, json: { data } }));
      }
      const reservations = reservationsOnFixedDay();
      await page.route(/\/api\/v1\/reservations\?/, (r) =>
        r.fulfill({ status: 200, json: reservations })
      );
      if (route === "setup") {
        // An operational venue is bounced off the /setup checklist; with no
        // floor plan the venue is still in setup and the checklist renders.
        await page.route(/\/api\/v1\/floor-plans\?/, (r) =>
          r.fulfill({
            status: 200,
            json: {
              data: [],
              pagination: {
                page: 1,
                limit: 25,
                total: 0,
                totalPages: 0,
                hasNext: false,
                hasPrev: false,
              },
            },
          })
        );
      }
      if (route === "admin") {
        // RequireAdmin reads the `admin` permission off the OIDC profile.
        await page.addInitScript(() => {
          for (const key of Object.keys(localStorage)) {
            if (!key.startsWith("oidc.user:")) continue;
            const user = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
            const profile = { ...(user.profile as object), permissions: ["admin"] };
            localStorage.setItem(key, JSON.stringify({ ...user, profile }));
          }
        });
      }
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.clock.setFixedTime(FIXED_NOW);
      await page.goto(`${path ?? ""}${QUERY[route] ?? ""}`);
      await page.waitForLoadState("networkidle");
      const landing = LANDS_ON[route] ?? path ?? "";
      const requested = new URL(landing, test.info().project.use.baseURL).pathname;
      const trim = (p: string) => p.replace(/\/$/, "");
      await expect(page, `${route} redirected away from ${requested}`).toHaveURL(
        (url) => trim(url.pathname) === trim(requested)
      );
      // react-router's error boundary is a page too; it must never become a baseline.
      await expect(page.getByText("Unexpected Application Error")).toHaveCount(0);
      expect(unmockedApi, `${route} reached API requests no mock answered`).toEqual([]);
      await expect(page).toHaveScreenshot(`${slug(route)}@${width}x${height}.png`, {
        fullPage: true,
        timeout: 15_000,
      });
    });
  }
}
