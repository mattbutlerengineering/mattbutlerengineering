import type { Page } from "@playwright/test";
import { loadFixture } from "./api-mocks.js";

/**
 * A stateful mock of the availability endpoints for the day-draft specs. It keeps the config
 * version the way the server does: a save made against an older version is refused as
 * `version-conflict`, so a Manager who saves twice from one draft shows up as a 409 here.
 */

const DINNER = { opensAt: 1020, lastSeatingAt: 1260, closesAt: 1380 };

export interface PutRecord {
  expected: number;
  status: number;
}

export interface AvailabilityMock {
  version: number;
  configReads: number;
  /** Reads of the config answer 500 while this is set. */
  failReads: boolean;
  /** Every save, in order, with the version it was checked against and how it ended. */
  readonly puts: PutRecord[];
  /** Reverts (Undo) received. */
  reverts: number;
  /** The next save answers this instead of being applied. */
  nextPut: { status: number; code: string; extra?: object } | null;
  /** Someone else saves: the version moves on and the next save here is refused. */
  colleague(summary?: string): void;
}

function between(from: string, to: string): string[] {
  const out: string[] = [];
  for (
    let d = new Date(`${from}T00:00:00Z`);
    d <= new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function mockAvailability(
  page: Page,
  options: { weekdays?: number[] } = {}
): Promise<AvailabilityMock> {
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
  const problem = (status: number, code: string, extra: object = {}) => ({
    status,
    contentType: "application/problem+json",
    body: JSON.stringify({
      type: "about:blank",
      title: code,
      status,
      detail: "Server said no.",
      code,
      ...extra,
    }),
  });
  let winner = {
    id: "chg-0",
    actorId: "auth0|ana",
    at: new Date().toISOString(),
    kind: "config",
    summary: "Dinner closes at 10:00 PM",
  };
  const mock: AvailabilityMock = {
    version: 7,
    configReads: 0,
    failReads: false,
    puts: [],
    reverts: 0,
    nextPut: null,
    colleague(summary = "Dinner closes at 10:00 PM") {
      mock.version += 1;
      winner = { ...winner, id: `chg-${mock.version}`, summary };
    },
  };
  let rules: unknown[] = [];

  await page.route(`${base}/availability/config`, (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as {
        expectedVersion: number;
        changes?: { upsert?: { dateRules?: Array<{ id: string }> } };
      };
      const record: PutRecord = { expected: body.expectedVersion, status: 0 };
      mock.puts.push(record);
      if (mock.nextPut) {
        const refused = mock.nextPut;
        mock.nextPut = null;
        record.status = refused.status;
        return route.fulfill(problem(refused.status, refused.code, refused.extra));
      }
      if (body.expectedVersion !== mock.version) {
        record.status = 409;
        return route.fulfill(problem(409, "version-conflict", { winningChange: winner }));
      }
      const upserted = body.changes?.upsert?.dateRules ?? [];
      rules = [
        ...rules.filter((r) => !upserted.some((u) => u.id === (r as { id: string }).id)),
        ...upserted,
      ];
      mock.version += 1;
      record.status = 200;
      return route.fulfill(json({ version: mock.version, changeId: `chg-${mock.version}` }));
    }
    mock.configReads += 1;
    if (mock.failReads) return route.fulfill(problem(500, "internal"));
    return route.fulfill(
      json({
        config: {
          schedules: [{ id: "regular", name: "Regular week", kind: "regular", isRegular: true }],
          venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
          scheduleServices: [
            {
              id: "ss-dinner",
              scheduleId: "regular",
              venueServiceId: "vs-dinner",
              ...DINNER,
              seating: { version: 1, interval: 15 },
              bookingTypes: ["online", "phone"],
            },
          ],
          assignments: [
            {
              id: "as",
              scheduleId: "regular",
              weekdays: options.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
              precedence: 0,
            },
          ],
          dateRules: rules,
        },
        version: mock.version,
        source: "rows",
      })
    );
  });
  await page.route(`${base}/availability/days*`, (route) => {
    const url = new URL(route.request().url());
    const open = options.weekdays ?? [0, 1, 2, 3, 4, 5, 6];
    const days = between(url.searchParams.get("from")!, url.searchParams.get("to")!).map(
      (serviceDate) => {
        const isOpen = open.includes(new Date(`${serviceDate}T00:00:00Z`).getUTCDay());
        return {
          serviceDate,
          label: isOpen ? "Regular week" : "Closed",
          scheduleId: isOpen ? "regular" : null,
          serviceCount: isOpen ? 1 : 0,
          closures: [],
          bookingOpen: { online: isOpen, phone: isOpen, waitlist: isOpen },
        };
      }
    );
    return route.fulfill(json(days));
  });
  await page.route(`${base}/availability/preview*`, (route) =>
    route.fulfill(problem(500, "internal"))
  );
  await page.route("**/availability/changes/*/revert", (route) => {
    mock.reverts += 1;
    mock.version += 1;
    return route.fulfill(json({ version: mock.version, changeId: `chg-${mock.version}` }));
  });
  return mock;
}
