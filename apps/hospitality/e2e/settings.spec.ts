import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("CF-10: Settings page and preferences persistence", () => {
  test("page loads with heading and appearance card", async ({ mockedPage }) => {
    await mockedPage.goto("/settings");

    await expect(mockedPage.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(mockedPage.getByText("Appearance")).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/settings-loaded.png", fullPage: true });
  });

  test("theme selector is visible with options", async ({ mockedPage }) => {
    await mockedPage.goto("/settings");

    await expect(mockedPage.getByText(/system|light|dark/i).first()).toBeVisible();
  });

  test("settings page persists across navigation", async ({ mockedPage }) => {
    await mockedPage.goto("/settings");

    await expect(mockedPage.getByRole("heading", { name: "Settings" })).toBeVisible();

    await mockedPage.goto("/");
    await mockedPage.goto("/settings");

    await expect(mockedPage.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(mockedPage.getByText("Appearance")).toBeVisible();
  });

  test("notifications card is visible", async ({ mockedPage }) => {
    await mockedPage.goto("/settings");

    await expect(mockedPage.getByText("Notifications")).toBeVisible();
    await mockedPage.screenshot({
      path: "e2e/screenshots/settings-notifications.png",
      fullPage: true,
    });
  });
});
