import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";
import { localDay } from "./local-day.js";

/**
 * Day drafts (docs/features/venue-availability/ux.md F2 steps 5-6): a draft must survive a failed
 * background reload of the config, and a refused Overwrite must say why inside the conflict
 * dialog, which stacks above the drawer. The config endpoint is stateful: the first read
 * answers, a save is refused as out of date, and every later read fails until the spec lets it
 * through again.
 */

const DINNER = { opensAt: 1020, lastSeatingAt: 1260, closesAt: 1380 };

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

/** The 15th of next month: one "Next" reaches it and it is never in the past. */
function midNextMonth(): string {
  const [year, month] = localDay().split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 15)).toISOString().slice(0, 10);
}

async function mockVenue(page: Page) {
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
  const problem = (status: number, code: string, extra: Record<string, unknown> = {}) => ({
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
  const state = { configReads: 0, failReads: false, saves: 0, failSave: false };

  await page.route(`${base}/availability/config`, (route) => {
    if (route.request().method() === "PUT") {
      state.saves += 1;
      return route.fulfill(
        state.failSave
          ? problem(422, "invalid-config", {
              issues: [
                { path: "dateRules.0", code: "overlap", message: "Dinner overlaps itself." },
              ],
            })
          : problem(409, "version-conflict", {
              winningChange: {
                id: "chg-9",
                actorId: "auth0|ana",
                at: new Date().toISOString(),
                kind: "config",
                summary: "Dinner closes at 10:00 PM",
              },
            })
      );
    }
    state.configReads += 1;
    if (state.failReads) return route.fulfill(problem(500, "internal"));
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
            { id: "as", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
          ],
          dateRules: [],
        },
        version: 7,
        source: "rows",
      })
    );
  });
  await page.route(`${base}/availability/days*`, (route) => {
    const url = new URL(route.request().url());
    const days = datesBetween(url.searchParams.get("from")!, url.searchParams.get("to")!).map(
      (serviceDate) => ({
        serviceDate,
        label: "Regular week",
        scheduleId: "regular",
        serviceCount: 1,
        closures: [],
        bookingOpen: { online: true, phone: true, waitlist: true },
      })
    );
    return route.fulfill(json(days));
  });
  return state;
}

test.describe("Availability day drafts", () => {
  test("a draft survives a failed reload, and a refused Overwrite explains itself in the dialog", async ({
    mockedPage,
  }) => {
    const state = await mockVenue(mockedPage);
    await mockedPage.goto("availability");
    await expect(mockedPage.locator("[data-date]").first()).toBeVisible();
    await mockedPage.getByRole("button", { name: "Next", exact: true }).click();
    await mockedPage.locator(`[data-date="${midNextMonth()}"]`).click();

    const drawer = mockedPage.getByRole("dialog").first();
    await drawer.getByRole("button", { name: "Edit Dinner" }).click();
    await drawer.getByRole("button", { name: "Remove Dinner" }).click();

    // Someone else saved first; the reload that follows the refusal fails.
    state.failReads = true;
    await drawer.getByRole("button", { name: "Save 1 date" }).click();
    const conflict = mockedPage.getByRole("dialog", { name: "Someone changed availability first" });
    await expect(conflict).toBeVisible();
    await expect.poll(() => state.configReads).toBeGreaterThan(1);

    // The draft is still there under the dialog, with the failed reload named above it.
    await expect(mockedPage.getByText("Couldn’t check for newer hours")).toBeAttached();
    await expect(drawer.getByRole("button", { name: "Save 1 date" })).toBeAttached();

    // Overwrite re-reads the version first; that read fails, and the dialog says so itself.
    await conflict.getByRole("button", { name: "Overwrite" }).click();
    await expect(conflict.getByRole("alert")).toBeVisible();
    await expect(conflict).toBeVisible();

    // A real click: the dialog stacks above the drawer, so its buttons are reachable.
    state.failReads = false;
    await conflict.getByRole("button", { name: "Discard mine" }).click();
    await expect(conflict).toBeHidden();
  });
});
