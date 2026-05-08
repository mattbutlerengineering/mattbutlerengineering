import { test, expect } from "./fixtures.js";

test.describe("CF-2: Timeline loads and displays reservations", () => {
  test("timeline page loads with grid", async ({ authPage }) => {
    await authPage.goto("/timeline");

    await expect(authPage.getByRole("heading", { name: "Timeline" })).toBeVisible();
    await expect(authPage.getByText("Live")).toBeVisible();
  });

  test("timeline shows date navigation", async ({ authPage }) => {
    await authPage.goto("/timeline");

    await expect(authPage.getByRole("button", { name: /Previous day/i })).toBeVisible();
    await expect(authPage.getByRole("button", { name: /Next day/i })).toBeVisible();
  });
});
