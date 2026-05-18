import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("Booking Widget demo page", () => {
  test("page loads with heading and description", async ({ mockedPage }) => {
    await mockedPage.goto("/booking-widget");

    await expect(mockedPage.getByRole("heading", { name: "Booking Widget" })).toBeVisible();
    await mockedPage.screenshot({
      path: "e2e/screenshots/booking-widget-loaded.png",
      fullPage: true,
    });
  });

  test("renders embed code section", async ({ mockedPage }) => {
    await mockedPage.goto("/booking-widget");

    const codeBlock = mockedPage.locator("pre");
    await expect(codeBlock).toBeVisible();

    const codeText = await codeBlock.textContent();
    expect(codeText).toContain("BookingWidget");
    await mockedPage.screenshot({
      path: "e2e/screenshots/booking-widget-embed.png",
      fullPage: true,
    });
  });

  test("shows venue selector or widget preview area", async ({ mockedPage }) => {
    await mockedPage.goto("/booking-widget");

    const previewArea = mockedPage.getByText(/preview|select a venue/i);
    await expect(previewArea).toBeVisible();
  });
});
