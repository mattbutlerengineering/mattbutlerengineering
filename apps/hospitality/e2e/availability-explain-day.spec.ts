import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";
import { WCAG_A_AA_TAGS } from "./axe-tags.js";
import { mockClosures } from "./helpers/close-mock.js";
import { localDay } from "./local-day.js";

/**
 * Explain this day (#10047): a guest could not book 7 PM, so staff open the day and read what the
 * engine did to every time. One bookable time and two removed for different reasons (pacing, no
 * free table), each with the screen that edits its rule.
 */

const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
const DATE = localDay(3);

const at = (minute: number, rest: Record<string, unknown> = {}) => ({
  serviceId: "vs-dinner",
  serviceName: "Dinner",
  minute,
  time: `${Math.floor(minute / 60)}:00`,
  startsAt: null,
  outcome: "bookable",
  ...rest,
});

const TRACE = {
  serviceDate: DATE,
  partySize: 2,
  channel: "online",
  basis: "current_rules",
  day: {
    serviceDate: DATE,
    scheduleId: "regular",
    services: [],
    closures: [],
    bookingOpen: { online: true, phone: true, waitlist: false },
    explanation: [],
  },
  times: [
    at(1020),
    at(1140, {
      outcome: "removed",
      reason: {
        code: "pacing",
        scope: "venue",
        limit: 3,
        windowMinutes: 15,
        covers: 3,
        partySize: 2,
      },
    }),
    at(1200, { outcome: "removed", reason: { code: "no_free_table", suitableTables: 4 } }),
  ],
};

/** The trace the engine would answer for the date and party the request names. */
function traceFor(date: string, partySize: number, times: readonly unknown[]) {
  const forParty = (time: unknown) => {
    const entry = time as { reason?: { partySize?: number } };
    return entry.reason?.partySize === undefined
      ? time
      : { ...entry, reason: { ...entry.reason, partySize } };
  };
  return {
    ...TRACE,
    serviceDate: date,
    partySize,
    day: { ...TRACE.day, serviceDate: date },
    times: times.map(forParty),
  };
}

async function serveTrace(page: Page, times: readonly unknown[] = TRACE.times): Promise<string[]> {
  await mockClosures(page);
  const urls: string[] = [];
  await page.route(`${base}/availability/trace?*`, (route) => {
    const url = new URL(route.request().url());
    urls.push(url.toString());
    const date = url.searchParams.get("date") ?? DATE;
    const partySize = Number(url.searchParams.get("partySize") ?? 2);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: traceFor(date, partySize, times) }),
    });
  });
  return urls;
}

/** "Monday, December 7": the day drawer's title for a date. */
const DAY_NAME = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
}).format(new Date(`${DATE}T00:00:00Z`));

test.describe("Explain this day", () => {
  test("opens from the day drawer with the date and party in the address, and explains every time", async ({
    mockedPage,
  }) => {
    const urls = await serveTrace(mockedPage);
    await mockedPage.goto(`availability/calendar?date=${DATE}`);
    await mockedPage
      .getByRole("dialog", { name: new RegExp(DAY_NAME) })
      .getByRole("button", { name: "Explain this day" })
      .click();

    await expect(mockedPage).toHaveURL(new RegExp(`/availability/explain\\?date=${DATE}`));
    await expect(
      mockedPage.getByRole("heading", { level: 1, name: "Explain this day" })
    ).toBeVisible();
    await expect(
      mockedPage.getByText(
        "1 time bookable for a party of 2. The most common reason times are missing is pacing."
      )
    ).toBeVisible();

    const rows = mockedPage.locator("li[data-outcome]");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Bookable");
    await expect(rows.nth(1)).toContainText(
      "Pacing: 3 of 3 covers already booked at 7:00 PM, so a party of 2 would go over."
    );
    await expect(rows.nth(2)).toContainText("Every suitable table is booked");
    await expect(
      rows.nth(1).getByRole("link", { name: "Edit booking rules, for 7:00 PM" })
    ).toHaveAttribute("href", /\/availability\/booking-rules$/);
    await expect(
      rows.nth(2).getByRole("link", { name: "Edit the floor plan, for 8:00 PM" })
    ).toHaveAttribute("href", /\/availability\/floor-plans$/);
    expect(urls.some((url) => url.includes(`date=${DATE}`))).toBe(true);
  });

  test("a shared address carries the party size", async ({ mockedPage }) => {
    const urls = await serveTrace(mockedPage);
    await mockedPage.goto(`availability/explain?date=${DATE}&partySize=6`);
    await expect(mockedPage.locator("li[data-outcome]")).toHaveCount(3);
    expect(urls.some((url) => url.includes("partySize=6"))).toBe(true);
    // The answer and the reason both speak for the party the address names.
    await expect(mockedPage.getByText(/^1 time bookable for a party of 6\./)).toBeVisible();
    await expect(mockedPage.locator("li[data-outcome]").nth(1)).toContainText(
      "so a party of 6 would go over"
    );
  });

  test("says when the venue is closed all day", async ({ mockedPage }) => {
    await serveTrace(mockedPage, []);
    await mockedPage.goto(`availability/explain?date=${DATE}`);
    await expect(
      mockedPage.getByText("Closed all day, so there are no times to explain.")
    ).toBeVisible();
  });

  test("has no axe violations and fits at desktop and phone widths", async ({ mockedPage }) => {
    await serveTrace(mockedPage);
    for (const width of [1280, 375]) {
      await mockedPage.setViewportSize({ width, height: 900 });
      await mockedPage.goto(`availability/explain?date=${DATE}`);
      await expect(mockedPage.locator("li[data-outcome]")).toHaveCount(3);
      const results = await new AxeBuilder({ page: mockedPage })
        .withTags(WCAG_A_AA_TAGS)
        .include("main")
        .analyze();
      expect(results.violations).toEqual([]);
      const overflow = await mockedPage.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow).toBe(false);
    }
  });
});
