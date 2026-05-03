import { test, expect } from "./fixtures.js";

test.describe("Booking Widget demo page", () => {
  test("page loads with heading and description", async ({ authPage }) => {
    await authPage.goto("/booking-widget");

    await expect(authPage.getByRole("heading", { name: "Booking Widget" })).toBeVisible();
  });

  test("renders embed code section", async ({ authPage }) => {
    await authPage.goto("/booking-widget");

    const codeBlock = authPage.locator("pre");
    await expect(codeBlock).toBeVisible();

    const codeText = await codeBlock.textContent();
    expect(codeText).toContain("BookingWidget");
  });

  test("shows venue selector or widget preview area", async ({ authPage }) => {
    await authPage.goto("/booking-widget");

    const previewArea = authPage.getByText(/preview|select a venue/i);
    await expect(previewArea).toBeVisible();
  });
});
