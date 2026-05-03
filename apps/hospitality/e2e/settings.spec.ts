import { test, expect } from "./fixtures.js";

test.describe("CF-10: Settings page and preferences persistence", () => {
  test("page loads with heading and appearance card", async ({ authPage }) => {
    await authPage.goto("/settings");

    await expect(authPage.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(authPage.getByText("Appearance")).toBeVisible();
  });

  test("theme selector is visible with options", async ({ authPage }) => {
    await authPage.goto("/settings");

    await expect(authPage.getByText(/system|light|dark/i).first()).toBeVisible();
  });

  test("settings page persists across navigation", async ({ authPage }) => {
    await authPage.goto("/settings");

    await expect(authPage.getByRole("heading", { name: "Settings" })).toBeVisible();

    await authPage.goto("/");
    await authPage.goto("/settings");

    await expect(authPage.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(authPage.getByText("Appearance")).toBeVisible();
  });

  test("notifications card is visible", async ({ authPage }) => {
    await authPage.goto("/settings");

    await expect(authPage.getByText("Notifications")).toBeVisible();
  });
});
