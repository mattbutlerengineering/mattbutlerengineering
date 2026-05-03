import { test, expect } from "./fixtures.js";

test.describe("Venue onboarding wizard", () => {
  test("page loads with heading and step 1 (Basic Info)", async ({ authPage }) => {
    await authPage.goto("/onboarding");

    await expect(authPage.getByRole("heading", { name: "New Venue" })).toBeVisible();
    await expect(authPage.getByLabel("Venue Name")).toBeVisible();
    await expect(authPage.getByLabel("Slug")).toBeVisible();
  });

  test("step 1 requires venue name before advancing", async ({ authPage }) => {
    await authPage.goto("/onboarding");

    await authPage.getByRole("button", { name: "Next" }).click();

    await expect(authPage.getByLabel("Venue Name")).toBeVisible();
  });

  test("completes step 1 and advances to step 2", async ({ authPage }) => {
    await authPage.goto("/onboarding");

    await authPage.getByLabel("Venue Name").fill("E2E Test Venue");

    await authPage.getByRole("button", { name: "Next" }).click();

    await expect(authPage.getByLabel("Timezone")).toBeVisible();
  });

  test("step 2 shows timezone and currency selectors", async ({ authPage }) => {
    await authPage.goto("/onboarding");

    await authPage.getByLabel("Venue Name").fill("E2E Test Venue");
    await authPage.getByRole("button", { name: "Next" }).click();

    await expect(authPage.getByLabel("Timezone")).toBeVisible();
    await expect(authPage.getByLabel("Currency")).toBeVisible();
  });

  test("Back button returns to previous step", async ({ authPage }) => {
    await authPage.goto("/onboarding");

    await authPage.getByLabel("Venue Name").fill("E2E Test Venue");
    await authPage.getByRole("button", { name: "Next" }).click();
    await expect(authPage.getByLabel("Timezone")).toBeVisible();

    await authPage.getByRole("button", { name: "Back" }).click();

    await expect(authPage.getByLabel("Venue Name")).toBeVisible();
  });

  test("Back button is disabled on step 1", async ({ authPage }) => {
    await authPage.goto("/onboarding");

    await expect(authPage.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  test("advances through all 5 steps to confirmation", async ({ authPage }) => {
    await authPage.goto("/onboarding");

    await authPage.getByLabel("Venue Name").fill("E2E Test Venue");
    await authPage.getByRole("button", { name: "Next" }).click();

    await expect(authPage.getByLabel("Timezone")).toBeVisible();
    await authPage.getByRole("button", { name: "Next" }).click();

    await authPage.getByRole("button", { name: "Next" }).click();

    await authPage.getByRole("button", { name: "Next" }).click();

    await expect(authPage.getByRole("button", { name: /create venue/i })).toBeVisible();
    await expect(authPage.getByText("Basic Information")).toBeVisible();
  });
});
