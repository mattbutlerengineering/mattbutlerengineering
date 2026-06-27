import type { Page, Route } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf-8");
}

function jsonResponse(route: Route, fixtureName: string, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: loadFixture(fixtureName),
  });
}

function emptyPaginated(route: Route): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      data: [],
      pagination: { page: 1, limit: 25, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    }),
  });
}

function jsonOk(route: Route, data: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
}

export async function mockApi(page: Page): Promise<void> {
  // Users
  await page.route("**/api/v1/users/me", (route) =>
    route.request().method() === "PATCH"
      ? jsonResponse(route, "user-me")
      : jsonResponse(route, "user-me")
  );
  await page.route("**/api/v1/users/me/preferences", (route) => jsonResponse(route, "user-me"));
  await page.route("**/api/v1/users?*", (route) => {
    const fixture = JSON.parse(loadFixture("user-me"));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [fixture.data],
        pagination: { page: 1, limit: 25, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      }),
    });
  });

  // Venues
  await page.route("**/api/v1/venues?*", (route) => jsonResponse(route, "venues-list"));
  await page.route("**/api/v1/venues/by-slug/*", (route) => {
    const venues = JSON.parse(loadFixture("venues-list"));
    return jsonOk(route, venues.data[0]);
  });
  await page.route(/\/api\/v1\/venues\/[^/?]+$/, (route) => {
    const method = route.request().method();
    const venues = JSON.parse(loadFixture("venues-list"));
    if (method === "POST" || method === "PATCH") {
      return jsonOk(route, { ...venues.data[0], updatedAt: new Date().toISOString() });
    }
    return jsonOk(route, venues.data[0]);
  });

  // Venue Groups
  await page.route("**/api/v1/venues/groups*", (route) => emptyPaginated(route));

  // Tables
  await page.route("**/api/v1/tables?*", (route) => jsonResponse(route, "tables-list"));
  await page.route(/\/api\/v1\/tables\/[^/?]+\/status$/, (route) => {
    const tables = JSON.parse(loadFixture("tables-list"));
    return jsonOk(route, { ...tables.data[0], status: "OCCUPIED" });
  });
  await page.route(/\/api\/v1\/tables\/[^/?]+$/, (route) => {
    const tables = JSON.parse(loadFixture("tables-list"));
    return jsonOk(route, tables.data[0]);
  });

  // Reservations
  // Re-date fixtures to today — the timeline discards r.date !== selectedDate (today) client-side.
  // Fixture JSON uses a static past date; this transform makes reservations visible in E2E tests.
  function todayReservations(): string {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const fixture = JSON.parse(loadFixture("reservations-list")) as {
      data: Array<Record<string, unknown>>;
      pagination: unknown;
    };
    return JSON.stringify({
      ...fixture,
      data: fixture.data.map((r) => ({
        ...r,
        date: today,
        startTime: String(r.startTime).replace(/^\d{4}-\d{2}-\d{2}/, today),
        endTime: String(r.endTime).replace(/^\d{4}-\d{2}-\d{2}/, today),
      })),
    });
  }

  await page.route("**/api/v1/reservations/walk-in", (route) => {
    const fixture = JSON.parse(todayReservations()) as { data: Array<Record<string, unknown>> };
    return jsonOk(route, {
      ...fixture.data[0],
      id: "res_e2e_walkin",
      status: "CONFIRMED",
      notes: "Walk-in",
    });
  });
  await page.route("**/api/v1/reservations/me*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: todayReservations() })
  );
  await page.route("**/api/v1/reservations?*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: todayReservations() })
  );
  await page.route(/\/api\/v1\/reservations\/[^/?]+$/, (route) => {
    const method = route.request().method();
    const reservations = JSON.parse(loadFixture("reservations-list"));
    if (method === "DELETE") {
      return jsonOk(route, { ...reservations.data[0], status: "CANCELLED" });
    }
    if (method === "PATCH") {
      return jsonOk(route, { ...reservations.data[0], updatedAt: new Date().toISOString() });
    }
    return jsonOk(route, reservations.data[0]);
  });

  // Guests
  await page.route("**/api/v1/guests/search*", (route) => jsonResponse(route, "guests-list"));
  await page.route("**/api/v1/guests/segments*", (route) => jsonResponse(route, "guest-segments"));
  await page.route("**/api/v1/guests/find-or-create", (route) => {
    const guests = JSON.parse(loadFixture("guests-list"));
    return jsonOk(route, guests.data[0]);
  });
  await page.route("**/api/v1/guests?*", (route) => jsonResponse(route, "guests-list"));
  await page.route(/\/api\/v1\/guests\/[^/?]+$/, (route) => {
    const method = route.request().method();
    const guests = JSON.parse(loadFixture("guests-list"));
    if (method === "PATCH" || method === "PUT") {
      return jsonOk(route, { ...guests.data[0], updatedAt: new Date().toISOString() });
    }
    return jsonOk(route, guests.data[0]);
  });

  // Floor Plans
  await page.route("**/api/v1/floor-plans?*", (route) => jsonResponse(route, "floor-plans-list"));
  await page.route(/\/api\/v1\/floor-plans\/[^/?]+\/bulk-update-positions$/, (route) => {
    const tables = JSON.parse(loadFixture("tables-list"));
    return jsonOk(route, tables.data);
  });
  await page.route(/\/api\/v1\/floor-plans\/[^/?]+\/active$/, (route) => {
    const floorPlans = JSON.parse(loadFixture("floor-plans-list"));
    return jsonOk(route, floorPlans.data[0]);
  });
  await page.route(/\/api\/v1\/floor-plans\/[^/?]+\/clone$/, (route) => {
    const floorPlans = JSON.parse(loadFixture("floor-plans-list"));
    return jsonOk(route, { ...floorPlans.data[0], id: "fp_e2e_clone", name: "Main Floor (Copy)" });
  });
  await page.route(/\/api\/v1\/floor-plans\/[^/?]+$/, (route) => {
    const floorPlans = JSON.parse(loadFixture("floor-plans-list"));
    return jsonOk(route, floorPlans.data[0]);
  });

  // Availability
  await page.route("**/api/v1/availability/*/dates*", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          { date: "2026-05-17", hasAvailability: true, slotCount: 5 },
          { date: "2026-05-18", hasAvailability: true, slotCount: 8 },
          { date: "2026-05-19", hasAvailability: false, slotCount: 0 },
        ],
      }),
    });
  });
  await page.route("**/api/v1/availability/*", (route) =>
    jsonResponse(route, "availability-slots")
  );

  // Holds
  await page.route("**/api/v1/holds/*/confirm", (route) => {
    const reservations = JSON.parse(loadFixture("reservations-list"));
    return jsonOk(route, reservations.data[0]);
  });
  await page.route(/\/api\/v1\/holds\/[^/?]+$/, (route) => {
    const method = route.request().method();
    if (method === "DELETE") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    }
    return jsonOk(route, {
      id: "hold_e2e_001",
      venueId: "ven_e2e_001",
      tableId: "tbl_e2e_001",
      date: "2026-05-17",
      startTime: "2026-05-17T18:00:00.000Z",
      endTime: "2026-05-17T19:30:00.000Z",
      partySize: 4,
      sessionId: "sess_e2e_001",
      expiresAt: "2026-05-17T18:10:00.000Z",
      createdAt: "2026-05-17T17:50:00.000Z",
    });
  });
  await page.route("**/api/v1/holds", (route) =>
    jsonOk(route, {
      id: "hold_e2e_001",
      venueId: "ven_e2e_001",
      tableId: "tbl_e2e_001",
      date: "2026-05-17",
      startTime: "2026-05-17T18:00:00.000Z",
      endTime: "2026-05-17T19:30:00.000Z",
      partySize: 4,
      sessionId: "sess_e2e_001",
      expiresAt: "2026-05-17T18:10:00.000Z",
      createdAt: "2026-05-17T17:50:00.000Z",
    })
  );

  // Stub window.EventSource so the app's SseClient fires onopen (→ "Live") and never onerror.
  // route.fulfill closes the connection immediately, triggering onerror before onopen can set
  // isConnected — so we replace the network mock with a browser-side EventSource stub instead.
  //
  // Tests can pre-configure named events to dispatch after onopen by setting:
  //   window.__fakeSSEConfig = { events: [{ type, data, lastEventId? }] }
  // via a second addInitScript call before navigation (e.g. for realtime-collaboration tests).
  await page.addInitScript(() => {
    type SseEventEntry = { type: string; data: unknown; lastEventId?: string };
    type FakeWindow = typeof window & {
      __fakeEventSources: FakeEventSource[];
      __fakeSSEConfig?: { events?: SseEventEntry[] };
      EventSource: typeof FakeEventSource;
    };

    class FakeEventSource {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSED = 2;

      readyState = 0;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      withCredentials = false;
      readonly url: string;

      private _closed = false;
      private _listeners = new Map<string, Array<(e: MessageEvent) => void>>();

      constructor(url: string, _init?: EventSourceInit) {
        this.url = url;
        (window as unknown as FakeWindow).__fakeEventSources.push(this);

        const cfg = (window as unknown as FakeWindow).__fakeSSEConfig;

        queueMicrotask(() => {
          if (this._closed) return;
          this.readyState = FakeEventSource.OPEN;
          this.onopen?.(new Event("open"));
          if (cfg?.events) {
            for (const evt of cfg.events) {
              const msg = new MessageEvent(evt.type, {
                data: JSON.stringify(evt.data),
                lastEventId: evt.lastEventId ?? "",
              });
              for (const h of this._listeners.get(evt.type) ?? []) h(msg);
            }
          }
        });
      }

      addEventListener(type: string, listener: (e: MessageEvent) => void): void {
        this._listeners.set(type, [...(this._listeners.get(type) ?? []), listener]);
      }

      removeEventListener(type: string, listener: (e: MessageEvent) => void): void {
        this._listeners.set(
          type,
          (this._listeners.get(type) ?? []).filter((l) => l !== listener)
        );
      }

      close(): void {
        this._closed = true;
        this.readyState = FakeEventSource.CLOSED;
      }
    }

    const win = window as unknown as FakeWindow;
    win.__fakeEventSources = [];
    win.EventSource = FakeEventSource;
  });

  // Public endpoints
  await page.route("**/public/v1/venues/*", (route) => {
    const venues = JSON.parse(loadFixture("venues-list"));
    return jsonOk(route, venues.data[0]);
  });
}
