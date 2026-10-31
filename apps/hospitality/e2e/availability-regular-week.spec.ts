import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";
import { localDay } from "./local-day.js";

/**
 * F-UW (docs/features/venue-availability/ux.md): Change regular week must not open days the
 * venue is closed on, and Escape on a drawer with unsaved edits asks before throwing them away.
 * The venue runs Tuesday to Saturday, so Sunday (0) and Monday (1) have no assignment.
 */

const TUE_SAT = [2, 3, 4, 5, 6];
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

async function mockTueSatVenue(page: Page) {
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
  let saved: { changes: { upsert: { assignments?: Array<{ weekdays: number[] }> } } } | null = null;
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });

  await page.route(`${base}/availability/config`, (route) => {
    if (route.request().method() === "PUT") {
      saved = route.request().postDataJSON();
      return route.fulfill(json({ version: 8, changeId: "change-1" }));
    }
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
          assignments: [{ id: "as", scheduleId: "regular", weekdays: TUE_SAT, precedence: 0 }],
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
      (serviceDate) => {
        const open = TUE_SAT.includes(new Date(`${serviceDate}T00:00:00Z`).getUTCDay());
        return {
          serviceDate,
          label: open ? "Regular week" : "Closed",
          scheduleId: open ? "regular" : null,
          serviceCount: open ? 1 : 0,
          closures: [],
          bookingOpen: { online: open, phone: open, waitlist: open },
        };
      }
    );
    return route.fulfill(json(days));
  });
  return { savedBody: () => saved };
}

test.describe("Change regular week (F-UW)", () => {
  test("a Tuesday to Saturday venue keeps Sunday and Monday closed", async ({ mockedPage }) => {
    const state = await mockTueSatVenue(mockedPage);
    await mockedPage.goto("availability");

    await mockedPage.getByRole("button", { name: "Change regular week…" }).click();
    await expect(mockedPage.getByText(/^Applies to Tue–Sat/)).toBeVisible();

    await mockedPage.getByLabel("Starting").click();
    // The page's own calendar also has a button with this data-date, behind the drawer; only the
    // date picker's cell is a gridcell itself.
    await mockedPage.locator(`[role="gridcell"][data-date="${localDay()}"]`).click();
    await mockedPage.getByLabel(/Schedule name/).fill("Summer hours");
    await mockedPage.getByRole("button", { name: /^Save hours from/ }).click();

    await expect.poll(() => state.savedBody()).not.toBeNull();
    const weekdays = state.savedBody()?.changes.upsert.assignments?.[0]?.weekdays;
    expect(weekdays).toEqual(TUE_SAT);
    expect(weekdays).not.toContain(0);
    expect(weekdays).not.toContain(1);
  });

  test("Escape on a drawer with unsaved edits asks first", async ({ mockedPage }) => {
    await mockTueSatVenue(mockedPage);
    await mockedPage.goto("availability");

    const drawer = mockedPage.getByRole("dialog", { name: "Change regular week" });
    await mockedPage.getByRole("button", { name: "Change regular week…" }).click();
    await expect(drawer).toBeVisible();
    await mockedPage.getByLabel(/Schedule name/).fill("Summer hours");

    await mockedPage.keyboard.press("Escape");
    const ask = mockedPage.getByRole("dialog", { name: "Discard your changes?" });
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Keep editing" }).click();
    await expect(mockedPage.getByLabel(/Schedule name/)).toHaveValue("Summer hours");

    await mockedPage.keyboard.press("Escape");
    await mockedPage
      .getByRole("dialog", { name: "Discard your changes?" })
      .getByRole("button", { name: "Discard" })
      .click();
    await expect(drawer).toBeHidden();
  });

  test("Cancel asks first, and the prompt's buttons are clickable above the drawer", async ({
    mockedPage,
  }) => {
    await mockTueSatVenue(mockedPage);
    await mockedPage.goto("availability");

    const drawer = mockedPage.getByRole("dialog", { name: "Change regular week" });
    await mockedPage.getByRole("button", { name: "Change regular week…" }).click();
    await mockedPage.getByLabel(/Schedule name/).fill("Summer hours");

    await mockedPage.getByRole("button", { name: "Cancel" }).click();
    const ask = mockedPage.getByRole("dialog", { name: "Discard your changes?" });
    await expect(ask).toBeVisible();
    // A real click: the prompt must stack above the drawer's overlay, not under it.
    await ask.getByRole("button", { name: "Discard" }).click();
    await expect(drawer).toBeHidden();
    await expect(ask).toBeHidden();
  });
});
