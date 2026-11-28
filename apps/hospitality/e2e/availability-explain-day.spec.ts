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

async function serveTrace(page: Page, body: unknown = TRACE): Promise<string[]> {
  await mockClosures(page);
  const urls: string[] = [];
  await page.route(`${base}/availability/trace?*`, (route) => {
    urls.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: body }),
    });
  });
  return urls;
}

test.describe("Explain this day", () => {
  test("opens from the day drawer with the date and party in the address, and explains every time", async ({
    mockedPage,
  }) => {
    const urls = await serveTrace(mockedPage);
    await mockedPage.goto(`availability/calendar?date=${DATE}`);
    await mockedPage.getByRole("dialog").getByRole("button", { name: "Explain this day" }).click();

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
    ).toHaveAttribute("href", /\/floor-plans$/);
    expect(urls.some((url) => url.includes(`date=${DATE}`))).toBe(true);
  });

  test("a shared address carries the party size", async ({ mockedPage }) => {
    const urls = await serveTrace(mockedPage);
    await mockedPage.goto(`availability/explain?date=${DATE}&partySize=6`);
    await expect(mockedPage.locator("li[data-outcome]")).toHaveCount(3);
    expect(urls.some((url) => url.includes("partySize=6"))).toBe(true);
  });

  test("says when the venue is closed all day", async ({ mockedPage }) => {
    await serveTrace(mockedPage, { ...TRACE, times: [] });
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
