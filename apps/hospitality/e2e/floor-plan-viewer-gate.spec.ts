import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { buildVenueTeamFixture } from "./api-mocks.js";

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

test.describe("Viewer role gate on floor plans", () => {
  test("a Host opening /floor-plans lands on /setup", async ({ mockedPage }) => {
    await viewAsHost(mockedPage);
    await mockedPage.goto("floor-plans");

    await expect(mockedPage).toHaveURL(/\/setup$/);
    await expect(mockedPage.getByRole("heading", { name: "Floor Plans" })).toHaveCount(0);
  });

  test("a Host opening /floor-plans/:id lands on /setup", async ({ mockedPage }) => {
    await viewAsHost(mockedPage);
    await mockedPage.goto("floor-plans/fp_e2e_001");

    await expect(mockedPage).toHaveURL(/\/setup$/);
    await expect(mockedPage.getByRole("heading", { name: "Main Floor" })).toHaveCount(0);
  });

  test("a Manager still reaches /floor-plans and the editor", async ({ mockedPage }) => {
    await mockedPage.goto("floor-plans");
    await expect(mockedPage).toHaveURL(/\/floor-plans$/);
    await expect(mockedPage.getByRole("heading", { name: "Floor Plans" })).toBeVisible();

    await mockedPage.goto("floor-plans/fp_e2e_001");
    await expect(mockedPage).toHaveURL(/\/floor-plans\/fp_e2e_001$/);
  });
});
