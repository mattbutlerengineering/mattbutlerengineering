import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { buildVenueTeamFixture } from "./api-mocks.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";

/**
 * Venue Setup's addresses after the Availability map was retired (#10032): the rail in the sidebar
 * shows the tree the map listed, the hub shows a Manager the launch steps, and every old address
 * (`/setup`, `/availability/map`) lands on the hub with a replace.
 */

const TEAM_ROUTE = /\/api\/v1\/venues\/[^/?]+\/team$/;

/** Registered after mockApi, so it wins: the viewer is a Host at the venue. */
async function viewAsHost(page: Page): Promise<void> {
  await page.route(TEAM_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { ...buildVenueTeamFixture(), viewerRole: "host" } }),
    })
  );
}

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Dashboard navigation" });
const hubHeading = (page: Page) => page.getByRole("heading", { level: 1, name: "Availability" });

test.describe("Venue Setup after the Availability map (#10032)", () => {
  test("an operational venue's sidebar has one Availability item, the rail nested under it, and no map", async ({
    mockedPage: page,
  }) => {
    await page.goto("availability");
    await expect(hubHeading(page)).toBeVisible();

    const item = sidebar(page)
      .getByRole("listitem")
      .filter({
        has: page.getByRole("button", { name: "Availability", exact: true }),
      });
    await expect(
      item.getByRole("navigation", { name: "Availability sections" }).getByRole("link", {
        name: "Regular hours",
      })
    ).toBeVisible();
    await expect(sidebar(page).getByRole("button", { name: /Availability map/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Availability map" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Launch progress" })).toHaveCount(0);
  });

  test("a pre-launch venue's sidebar shows Availability with the launch count", async ({
    mockedPage: page,
  }) => {
    await mockEmptyVenue(page);
    await page.goto("availability");
    await expect(
      sidebar(page).getByRole("button", { name: /^Availability \d of 3$/ })
    ).toBeVisible();
    await expect(sidebar(page).getByRole("button", { name: /Availability map/ })).toHaveCount(0);
  });

  test("an unready venue is sent from /timeline to Availability", async ({ mockedPage: page }) => {
    await mockEmptyVenue(page);
    await page.goto("timeline");
    // The hub sends a Manager of an empty venue on to first setup at Regular hours.
    await expect(page).toHaveURL(/\/availability(\/hours)?$/);
  });

  for (const old of ["setup", "availability/map"]) {
    test(`the old /${old} address lands on the hub with a replace`, async ({
      mockedPage: page,
    }) => {
      await page.goto("timeline");
      await page.goto(old);
      await expect(page).toHaveURL(/\/availability$/);
      await expect(hubHeading(page)).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/\/timeline$/);
    });
  }

  test("/setup/hours still lands on Availability", async ({ mockedPage: page }) => {
    await page.goto("setup/hours");
    await expect(page).toHaveURL(/\/availability$/);
    await expect(hubHeading(page)).toBeVisible();
  });

  test("a Host sees no launch progress and no set-up call to action on the hub", async ({
    mockedPage: page,
  }) => {
    await mockEmptyVenue(page);
    await viewAsHost(page);
    await page.goto("availability");

    await expect(hubHeading(page)).toBeVisible();
    await expect(page.getByRole("region", { name: "Launch progress" })).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("button", {
        name: /set up|edit|change|close|add|move|rules|compare|create|open/i,
      })
    ).toHaveCount(0);
  });
});
