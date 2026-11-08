import type { Page } from "@playwright/test";
import { loadFixture } from "../api-mocks.js";

/**
 * The stateful closure mock (F-close): `GET/PUT …/availability/config`, `…/availability/days`,
 * `…/closures/impact`, `…/closures/notice-preview`, `GET/POST …/closures` and the call-list, lifted
 * out of `availability-close.spec.ts` so the Close scenarios (S5, S7) and the Pause scenario (S10)
 * share it. The config and days answer with the closure once its POST lands. Register it after
 * `mockApi` (the `mockedPage` fixture does): the last-registered route answers first.
 */

/** The shape `GET …/availability/config` returns. */
export interface AvailabilityConfigResponse {
  readonly config: Record<string, unknown> & { readonly dateRules?: readonly unknown[] };
  readonly version: number;
  readonly source: string;
}

/**
 * While `dropped`, a closure POST commits and then its response is lost. The API client replays a
 * POST that carries an Idempotency-Key on a network error, so every attempt of one click drops.
 */
export interface CloseConnection {
  dropped: boolean;
}

export interface CloseMockOptions {
  /**
   * The one service date the Manager closes whole-venue in the scenario. The days answer shows the
   * "Closed" band on it once the POST lands, and `bookings` apply to it. Omit when the spec only
   * checks that a closure was saved.
   */
  readonly closeDate?: string;
  /** Bookings a whole-venue closure of `closeDate` would affect; 0 saves with no second step. */
  readonly bookings?: number;
  /** The config served before a closure lands; default is the Dinner-only venue below. */
  readonly config?: AvailabilityConfigResponse;
  readonly connection?: CloseConnection;
}

/** The accepted POST body: the rule plus `expectedVersion`, `decisions` and the rest as sent. */
export type SavedClosure = { readonly rule: unknown } & Record<string, unknown>;

export interface CloseMock {
  readonly venueId: string;
  /** The last accepted POST body, or null before any. */
  readonly saved: () => SavedClosure | null;
  /** Every POST attempt: its Idempotency-Key and the rule id. */
  readonly posts: () => ReadonlyArray<{ key: string | undefined; ruleId: string }>;
  /** Every notice-preview request body. */
  readonly notices: () => ReadonlyArray<{ action: string; message: string | null }>;
}

const DINNER = { opensAt: 1020, lastSeatingAt: 1260, closesAt: 1380 };
const ALL_DAY_CLOSURE = { from: 0, to: 2880 };

/** The venue `availability-close.spec.ts` was written against: Dinner every day, version 7. */
export const DINNER_ONLY_CONFIG: AvailabilityConfigResponse = {
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
      { id: "as", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
    ],
    dateRules: [],
  },
  version: 7,
  source: "rows",
};

export function datesBetween(from: string, to: string): string[] {
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

export async function mockClosures(page: Page, options: CloseMockOptions = {}): Promise<CloseMock> {
  const { closeDate, bookings = 0, config: base = DINNER_ONLY_CONFIG, connection } = options;
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const venueId = String(venues.data[0]?.id);
  const routeBase = `**/api/v1/venues/${venueId}`;
  let version = base.version;
  let saved: SavedClosure | null = null;
  const posts: Array<{ key: string | undefined; ruleId: string }> = [];
  const notices: Array<{ action: string; message: string | null }> = [];
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
  const guestCount = (i: number) => (i < 10 ? 4 : 3);
  const covers = Array.from({ length: bookings }, (_, i) => guestCount(i)).reduce(
    (a, b) => a + b,
    0
  );
  const deposits = Math.min(3, bookings);

  const configAnswer = () => ({
    ...base,
    config: {
      ...base.config,
      dateRules: [...(base.config.dateRules ?? []), ...(saved ? [saved.rule] : [])],
    },
    version,
  });

  await page.route(`${routeBase}/availability/config`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill(json(configAnswer()));
  });
  await page.route(`${routeBase}/availability/days*`, (route) => {
    const url = new URL(route.request().url());
    const days = datesBetween(url.searchParams.get("from")!, url.searchParams.get("to")!).map(
      (serviceDate) => {
        const closed = saved !== null && serviceDate === closeDate;
        return {
          serviceDate,
          label: closed ? "Closed" : "Regular week",
          scheduleId: closed ? null : "regular",
          serviceCount: closed ? 0 : 1,
          closures: closed ? [{ ruleId: "rule-1", targetKind: "venue", ...ALL_DAY_CLOSURE }] : [],
          bookingOpen: { online: !closed, phone: !closed, waitlist: !closed },
        };
      }
    );
    return route.fulfill(json(days));
  });
  await page.route(`${routeBase}/closures/impact`, (route) => {
    const rule = route.request().postDataJSON().rule as { startsOn: string; targetKind: string };
    const affected =
      closeDate !== undefined &&
      rule.startsOn === closeDate &&
      rule.targetKind === "venue" &&
      bookings > 0;
    const reservations = Array.from({ length: affected ? bookings : 0 }, (_, i) => ({
      id: `res-${i}`,
      startTime: `${closeDate}T${String(17 + (i % 5)).padStart(2, "0")}:30:00Z`,
      endTime: `${closeDate}T${String(19 + (i % 3)).padStart(2, "0")}:00:00Z`,
      partySize: guestCount(i),
      guestName: `Guest ${i + 1}`,
      deposit: i < 3 ? { amountCents: 4000, currency: "USD" } : null,
      runsIntoClosure: false,
    }));
    return route.fulfill(
      json({
        reservations: reservations.length,
        covers: affected ? covers : 0,
        depositsHeld: affected ? deposits : 0,
        groups: affected
          ? [
              {
                groupKey: `${closeDate}:closed`,
                date: closeDate,
                kind: "closed",
                covers,
                depositsHeld: deposits,
                reservations,
              },
            ]
          : [],
      })
    );
  });
  // The server renders the notice (closure-content.ts); the browser shows it as sent. This answer
  // stands in for that render and echoes the request, so the spec checks what the screen asks for.
  await page.route(`${routeBase}/closures/notice-preview`, (route) => {
    const body = route.request().postDataJSON() as { action: string; message: string | null };
    notices.push(body);
    return route.fulfill(
      json({
        email: {
          from: "Matt Butler Engineering <reservations@example.com>",
          subject: "Your reservation at Rivera Bistro is cancelled",
          text: `Rivera Bistro is closed.\n${body.message ?? ""}`,
        },
        sms: `Rivera Bistro is closed. ${body.message ?? ""} Rebook: https://example.com/m`,
      })
    );
  });
  await page.route(`${routeBase}/closures`, (route) => {
    // The Special dates tab lists closure outcomes; none exist in these flows.
    if (route.request().method() === "GET") return route.fulfill(json([]));
    const body = route.request().postDataJSON() as SavedClosure & { rule: { id: string } };
    posts.push({ key: route.request().headers()["idempotency-key"], ruleId: body.rule.id });
    // A known key answers with the stored result and changes nothing (closure-command.ts replayOf).
    if (saved === null) {
      saved = body;
      version += 1;
    }
    if (connection?.dropped) return route.abort("connectionreset");
    return route.fulfill(
      json({
        ruleId: "rule-1",
        version,
        changeId: "chg-close-1",
        outcomes: { cancel: bookings, move: 0, keep_notify: 0, keep_silent: 0 },
      })
    );
  });

  return {
    venueId,
    saved: () => saved,
    posts: () => posts,
    notices: () => notices,
  };
}
