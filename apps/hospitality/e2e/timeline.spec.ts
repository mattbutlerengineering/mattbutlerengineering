import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("CF-2: Timeline loads and displays reservations", () => {
  test("timeline page loads with grid", async ({ mockedPage }) => {
    await mockedPage.goto("/timeline");

    await expect(mockedPage.getByRole("heading", { name: "Timeline" })).toBeVisible();
    await expect(mockedPage.getByText("Live")).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/timeline-loaded.png", fullPage: true });
  });

  test("timeline shows date navigation", async ({ mockedPage }) => {
    await mockedPage.goto("/timeline");

    await expect(mockedPage.getByRole("button", { name: /Previous day/i })).toBeVisible();
    await expect(mockedPage.getByRole("button", { name: /Next day/i })).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/timeline-date-nav.png", fullPage: true });
  });
});
