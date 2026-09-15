import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page, Route } from "@playwright/test";
import { mockApi } from "../api-mocks.js";

// Pin the runner's zone so the local-vs-UTC day split below is exercised on UTC CI as well as
// on a Pacific laptop (Node re-reads TZ at runtime; vitest isolates each file in its own fork).
process.env.TZ = "America/Los_Angeles";

/**
 * Drives the real `mockApi` through a stand-in `Page` so the stateful routes can be
 * exercised request-by-request without a browser: PATCH a table status, then read it
 * back through the tables list, the reservations list and a walk-in (#5023, A4.2 / P01).
 *
 * Dispatch mirrors Playwright: the LAST registered matching handler wins, and a handler
 * that calls `route.fallback()` hands the request to the next-older match.
 */

type Handler = (route: Route) => Promise<void> | void;
interface Registered {
  readonly pattern: string | RegExp;
  readonly handler: Handler;
}
interface Fulfilled {
  readonly status?: number;
  readonly body?: string;
}

/** Playwright 1.62 glob subset: `**` any chars, `*` any chars but `/`, `?` a literal `?`. */
function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob.charAt(i);
    if (c === "*") {
      if (glob[i + 1] === "*") {
        source += ".*";
        i += 1;
      } else {
        source += "[^/]*";
      }
    } else if (c === "?") {
      source += "\\?";
    } else {
      source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

function matches(pattern: string | RegExp, url: string): boolean {
  return pattern instanceof RegExp ? pattern.test(url) : globToRegExp(pattern).test(url);
}

interface MockedApi {
  request(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }>;
}

async function createMockedApi(): Promise<MockedApi> {
  const registered: Registered[] = [];
  const page = {
    route: async (pattern: string | RegExp, handler: Handler) => {
      registered.push({ pattern, handler });
    },
    addInitScript: async () => {},
    evaluate: async () => {},
  } as unknown as Page;
  await mockApi(page);

  return {
    async request(method, path, body) {
      const url = `http://localhost:3002${path}`;
      for (let i = registered.length - 1; i >= 0; i -= 1) {
        const entry = registered[i];
        if (!entry || !matches(entry.pattern, url)) continue;
        const { pattern, handler } = entry;
        const outcome: { fulfilled: Fulfilled | null; fellBack: boolean } = {
          fulfilled: null,
          fellBack: false,
        };
        const route = {
          request: () => ({
            method: () => method,
            url: () => url,
            postDataJSON: () => body ?? null,
          }),
          fulfill: async (response: Fulfilled) => {
            outcome.fulfilled = response;
          },
          fallback: async () => {
            outcome.fellBack = true;
          },
        } as unknown as Route;
        await handler(route);
        if (outcome.fellBack) continue;
        if (outcome.fulfilled) {
          return {
            status: outcome.fulfilled.status ?? 200,
            data: JSON.parse(outcome.fulfilled.body ?? "null").data,
          };
        }
        throw new Error(`mock handler for ${String(pattern)} neither fulfilled nor fell back`);
      }
      throw new Error(`no mock route matched ${method} ${url}`);
    },
  };
}

const TABLES = "/api/v1/tables?venueId=ven_e2e_001";
const RESERVATIONS = "/api/v1/reservations?venueId=ven_e2e_001&limit=100";

describe("api-mocks — table-status overlay (#5023)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("PATCH /tables/:id/status stores the status and the tables list reflects it", async () => {
    const api = await createMockedApi();

    const patched = await api.request("PATCH", "/api/v1/tables/tbl_e2e_001/status", {
      status: "OCCUPIED",
    });
    expect(patched.data).toMatchObject({ id: "tbl_e2e_001", status: "OCCUPIED" });

    const tables = await api.request("GET", TABLES);
    const byId = new Map(tables.data.map((t: { id: string }) => [t.id, t]));
    expect(byId.get("tbl_e2e_001")).toMatchObject({ status: "OCCUPIED" });
    expect(byId.get("tbl_e2e_003")).toMatchObject({ status: "AVAILABLE" });
  });

  it("the next GET /reservations?* overlays the stored status on every reservation at that table", async () => {
    const api = await createMockedApi();
    await api.request("PATCH", "/api/v1/tables/tbl_e2e_001/status", { status: "OCCUPIED" });

    const list = await api.request("GET", RESERVATIONS);
    const atTable = list.data.filter((r: { tableId: string }) => r.tableId === "tbl_e2e_001");
    expect(atTable.length).toBeGreaterThan(0);
    for (const r of atTable) {
      expect(r.table).toMatchObject({ id: "tbl_e2e_001", status: "OCCUPIED" });
    }
    // Untouched tables keep the fixture shape (no embedded table is invented).
    const elsewhere = list.data.find((r: { id: string }) => r.id === "res_e2e_003");
    expect(elsewhere.table).toBeUndefined();
  });

  it("walk-in is dated on the local day with the requested table embedded", async () => {
    const api = await createMockedApi();
    await api.request("PATCH", "/api/v1/tables/tbl_e2e_003/status", { status: "OCCUPIED" });

    const localToday = new Date().toLocaleDateString("en-CA");
    const walkIn = await api.request("POST", "/api/v1/reservations/walk-in", {
      partySize: 2,
      tableId: "tbl_e2e_003",
      venueId: "ven_e2e_001",
      guestName: "Test Guest",
    });

    expect(walkIn.data.date).toBe(localToday);
    expect(String(walkIn.data.startTime).startsWith(localToday)).toBe(true);
    expect(walkIn.data).toMatchObject({
      tableId: "tbl_e2e_003",
      guestName: "Test Guest",
      status: "CONFIRMED",
      table: { id: "tbl_e2e_003", name: "Table 3", status: "OCCUPIED" },
    });

    const list = await api.request("GET", RESERVATIONS);
    expect(list.data.some((r: { id: string }) => r.id === walkIn.data.id)).toBe(true);
  });

  it("re-dates fixtures to the local calendar day, not the UTC day", async () => {
    // 23:30 Pacific on 2026-09-04 is 06:30Z on 2026-09-05 — the UTC slice answered tomorrow.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T06:30:00Z"));
    const api = await createMockedApi();

    const list = await api.request("GET", RESERVATIONS);
    expect(list.data.length).toBeGreaterThan(0);
    for (const r of list.data) {
      expect(r.date).toBe("2026-09-04");
      expect(String(r.startTime).startsWith("2026-09-04")).toBe(true);
    }
  });

  it("no UTC date slice remains in api-mocks.ts", () => {
    const source = readFileSync(join(import.meta.dirname, "..", "api-mocks.ts"), "utf-8");
    expect(source).not.toContain("toISOString().slice(0, 10)");
    expect(source).toContain('toLocaleDateString("en-CA")');
  });
});
