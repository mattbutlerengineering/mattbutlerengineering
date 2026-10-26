import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";
import { localDay } from "./local-day.js";

/**
 * F5 (docs/features/venue-availability/ux.md), the PRD demo: a Manager closes 24 December with
 * 14 bookings, chooses cancel and notify, and sees the calendar band and the outcome counts.
 * The config, days, impact and closure endpoints are stateful: the days answer with the band
 * once the closure POST lands.
 */

const DINNER = { opensAt: 1020, lastSeatingAt: 1260, closesAt: 1380 };
const ALL_DAY_CLOSURE = { from: 0, to: 2880 };
const BOOKINGS = 14;
const GUESTS = 52;

/** The next 24 December on or after today, and how many months away its page is. */
function nextChristmasEve(): { date: string; monthsAhead: number } {
  const today = localDay();
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-12-24`;
  const date = today <= thisYear ? thisYear : `${year + 1}-12-24`;
  const monthsAhead = (Number(date.slice(0, 4)) - year) * 12 + 12 - Number(today.slice(5, 7));
  return { date, monthsAhead };
}

function datesBetween(from: string, to: string): string[] {
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

async function mockAvailability(page: Page, closeDate: string) {
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const venueId = String(venues.data[0]?.id);
  const base = `**/api/v1/venues/${venueId}`;
  let version = 7;
  let saved: Record<string, unknown> | null = null;
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });

  const config = () => ({
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
      dateRules: saved ? [(saved as { rule: unknown }).rule] : [],
    },
    version,
    source: "rows",
  });

  await page.route(`${base}/availability/config`, (route) => route.fulfill(json(config())));
  await page.route(`${base}/availability/days*`, (route) => {
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
  await page.route(`${base}/closures/impact`, (route) => {
    const rule = route.request().postDataJSON().rule as { startsOn: string; targetKind: string };
    const affected = rule.startsOn === closeDate && rule.targetKind === "venue";
    const reservations = Array.from({ length: affected ? BOOKINGS : 0 }, (_, i) => ({
      id: `res-${i}`,
      startTime: `${closeDate}T${String(17 + (i % 5)).padStart(2, "0")}:30:00Z`,
      endTime: `${closeDate}T${String(19 + (i % 3)).padStart(2, "0")}:00:00Z`,
      partySize: i < 10 ? 4 : 3,
      guestName: `Guest ${i + 1}`,
      deposit: i < 3 ? { amountCents: 4000, currency: "USD" } : null,
      runsIntoClosure: false,
    }));
    return route.fulfill(
      json({
        reservations: reservations.length,
        covers: affected ? GUESTS : 0,
        depositsHeld: affected ? 3 : 0,
        groups: affected
          ? [
              {
                groupKey: `${closeDate}:closed`,
                date: closeDate,
                kind: "closed",
                covers: GUESTS,
                depositsHeld: 3,
                reservations,
              },
            ]
          : [],
      })
    );
  });
  await page.route(`${base}/closures`, (route) => {
    saved = route.request().postDataJSON() as Record<string, unknown>;
    version += 1;
    return route.fulfill(
      json({
        ruleId: "rule-1",
        version,
        changeId: "chg-close-1",
        outcomes: { cancel: BOOKINGS, move: 0, keep_notify: 0, keep_silent: 0 },
      })
    );
  });
  return { saved: () => saved, venueId };
}

test.describe("Availability close dialog (F5)", () => {
  test("a Manager closes 24 December, cancels and notifies 14 bookings, and sees the band", async ({
    mockedPage,
  }) => {
    const eve = nextChristmasEve();
    const state = await mockAvailability(mockedPage, eve.date);
    await mockedPage.goto("availability");

    const calendar = mockedPage.getByRole("grid", { name: "Availability calendar" });
    await expect(calendar).toBeVisible();
    for (let i = 0; i < eve.monthsAhead; i += 1) {
      await mockedPage.getByRole("button", { name: "Next", exact: true }).click();
    }
    await calendar.locator(`[data-date="${eve.date}"]`).click();
    await mockedPage.getByRole("button", { name: "Close…", exact: true }).click();

    const dialog = mockedPage.getByRole("dialog", { name: "Close", exact: true });
    await expect(dialog.getByText("Step 1 of 2")).toBeVisible();
    await expect(
      dialog.getByText("14 reservations · 52 guests are booked in this closure")
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Closed for a private event" }).click();
    await dialog.getByRole("button", { name: "Next", exact: true }).click();

    await expect(dialog.getByText("Step 2 of 2")).toBeVisible();
    await expect(dialog.getByText(/14 reservations · 52 guests · 3 deposits held/)).toBeVisible();
    const save = dialog.getByRole("button", { name: "Close and cancel 14" });
    // A choice is required for every group before anything is saved.
    await expect(dialog.getByRole("button", { name: /^Close/ }).last()).toBeDisabled();
    await dialog.getByRole("radio", { name: /Cancel, notify & refund/ }).check();
    await save.click();

    await expect(mockedPage.getByText(/closed · 14 guests notified/)).toBeVisible();
    expect(state.saved()).toMatchObject({
      expectedVersion: 7,
      rule: { kind: "closure", targetKind: "venue", startsOn: eve.date, endsOn: eve.date },
      decisions: [{ groupKey: `${eve.date}:closed`, action: "cancel" }],
    });
    await expect(calendar.locator(`[data-date="${eve.date}"]`)).toContainText("Closed all day");
  });
});
