import type { Page } from "@playwright/test";
import { addDays, applyChanges } from "@mbe/availability";
import type { AvailabilityConfig, AvailabilityConfigChanges, DateRule } from "@mbe/types";
import { loadFixture } from "../api-mocks.js";
import { serveDaysAndPreview } from "./engine-days-mock.js";

/**
 * One availability venue held in memory for any number of pages (browser contexts): the config
 * (`GET`/`PUT …/availability/config`, closures saved through `POST …/closures/batch`), the days
 * and preview answered from it by the engine, and the holiday-decision routes
 * (`…/availability/holiday-decisions`). Playwright route handlers run in the test process, so
 * every page that calls `serveSharedConfig(page, store)` reads and writes the same `store`.
 */

export interface DecisionCall {
  readonly method: "PUT" | "DELETE";
  readonly date: string;
  readonly body: unknown;
}

export interface ConfigPut {
  readonly expectedVersion: number;
  readonly changes: AvailabilityConfigChanges;
}

export interface SharedConfigStore {
  config: AvailabilityConfig;
  version: number;
  /** `serviceDate` to the instant it was decided. */
  readonly decisions: Map<string, string>;
  readonly decisionCalls: DecisionCall[];
  readonly configPuts: ConfigPut[];
  /** The bodies `POST …/closures/batch` carried. */
  readonly batches: Array<{ items: Array<{ rule: DateRule }> }>;
  /** The next this many `PUT` decisions answer 404, as a server without the routes would. */
  failDecisionPuts: number;
  /** Reads of the decision list, to show a page asked once. */
  decisionReads: number;
}

export function createSharedConfig(config: AvailabilityConfig, version = 7): SharedConfigStore {
  return {
    config,
    version,
    decisions: new Map(),
    decisionCalls: [],
    configPuts: [],
    batches: [],
    failDecisionPuts: 0,
    decisionReads: 0,
  };
}

const json = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ data }),
});

export async function serveSharedConfig(page: Page, store: SharedConfigStore): Promise<void> {
  const venues = JSON.parse(loadFixture("venues-list")) as {
    data: Array<{ id: string; ianaTimezone: string }>;
  };
  const venueId = String(venues.data[0]?.id);
  const timezone = String(venues.data[0]?.ianaTimezone);
  const base = `**/api/v1/venues/${venueId}`;

  await page.route(`${base}/availability/config`, (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as ConfigPut;
      store.configPuts.push(body);
      store.config = applyChanges(store.config, body.changes, new Date().toISOString());
      store.version += 1;
      return route.fulfill(json({ version: store.version, changeId: `change-${store.version}` }));
    }
    return route.fulfill(json({ config: store.config, version: store.version, source: "rows" }));
  });
  await serveDaysAndPreview(page, base, timezone, () => ({
    config: store.config,
    version: store.version,
  }));
  await page.route(`${base}/availability/changes*`, (route) =>
    route.fulfill(json({ total: 0, offset: 0, items: [], undoable: null }))
  );

  await page.route(`${base}/closures/impact`, (route) =>
    route.fulfill(json({ reservations: 0, covers: 0, depositsHeld: 0, groups: [] }))
  );
  await page.route(`${base}/closures/batch`, (route) => {
    const body = route.request().postDataJSON() as { items: Array<{ rule: DateRule }> };
    store.batches.push(body);
    store.config = {
      ...store.config,
      dateRules: [...store.config.dateRules, ...body.items.map((item) => item.rule)],
    };
    store.version += 1;
    return route.fulfill(
      json({
        version: store.version,
        results: body.items.map((item) => ({
          ruleId: item.rule.id,
          version: store.version,
          changeId: `change-${store.version}`,
          outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
        })),
      })
    );
  });

  await page.route(
    new RegExp(
      `/api/v1/venues/${venueId}/availability/holiday-decisions(?:/(\\d{4}-\\d{2}-\\d{2}))?(?:\\?.*)?$`
    ),
    (route) => {
      const request = route.request();
      const date = /holiday-decisions\/(\d{4}-\d{2}-\d{2})/.exec(request.url())?.[1];
      if (request.method() === "GET") {
        store.decisionReads += 1;
        const { searchParams } = new URL(request.url());
        const from = searchParams.get("from") ?? "0000-00-00";
        const to = searchParams.get("to") ?? addDays(from, 400);
        const rows = [...store.decisions]
          .filter(([d]) => d >= from && d <= to)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([serviceDate, createdAt]) => ({
            serviceDate,
            decision: "open_as_usual",
            createdAt,
          }));
        return route.fulfill(json(rows));
      }
      if (date === undefined) return route.fallback();
      const method = request.method() === "DELETE" ? "DELETE" : "PUT";
      store.decisionCalls.push({
        method,
        date,
        body: method === "PUT" ? request.postDataJSON() : null,
      });
      if (method === "DELETE") {
        store.decisions.delete(date);
        return route.fulfill({ status: 204 });
      }
      if (store.failDecisionPuts > 0) {
        store.failDecisionPuts -= 1;
        return route.fulfill({
          status: 404,
          contentType: "application/problem+json",
          body: JSON.stringify({ type: "about:blank", title: "Not Found", status: 404 }),
        });
      }
      const createdAt = store.decisions.get(date) ?? new Date().toISOString();
      store.decisions.set(date, createdAt);
      return route.fulfill(json({ serviceDate: date, decision: "open_as_usual", createdAt }));
    }
  );
}
