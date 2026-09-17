import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

const VENUE_SLUG = "e2e-test-bistro";
/** WCAG 2.5.8 target-size minimum — the audit's own bar (#4981). */
const MIN_TARGET_SIZE_PX = 44;

/** Asserts every element matching `selector` meets the 44px target-size floor. */
async function expectTargetSizes(page: Page, selector: string): Promise<void> {
  const elements = page.locator(selector);
  const count = await elements.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const box = await elements.nth(i).boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN_TARGET_SIZE_PX);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TARGET_SIZE_PX);
  }
}

test.describe("Booking Widget — mobile target sizes (#4981)", () => {
  test("party-size and CTA buttons on the first (date-party) screen meet the 44px minimum at 390x844", async ({
    mockedPage,
  }) => {
    await mockedPage.setViewportSize({ width: 390, height: 844 });
    await mockedPage.goto(`book/${VENUE_SLUG}`);
    await expect(mockedPage.getByRole("group", { name: /party size/i })).toBeVisible();

    await expectTargetSizes(
      mockedPage,
      '[role="group"][aria-labelledby="party-size-label"] button'
    );
    await expectTargetSizes(mockedPage, 'button:has-text("Find Available Times")');
  });

  test("time-slot options meet the 44px minimum at 390x844", async ({ mockedPage }) => {
    await mockedPage.setViewportSize({ width: 390, height: 844 });
    await mockedPage.goto(`book/${VENUE_SLUG}`);

    // selectedDate now defaults to today (#4981) — no typing needed, the
    // mocked availability fixture returns the same slots regardless of date.
    await mockedPage.getByRole("button", { name: "Find Available Times" }).click();
    await expect(mockedPage.getByRole("option").first()).toBeVisible();

    await expectTargetSizes(mockedPage, '[role="option"]');
  });
});

test.describe("Booking Widget demo page", () => {
  test("page loads with heading and description", async ({ mockedPage }) => {
    await mockedPage.goto("booking-widget");

    await expect(mockedPage.getByRole("heading", { name: "Booking Widget" })).toBeVisible();
    await mockedPage.screenshot({
      path: "e2e/screenshots/booking-widget-loaded.png",
      fullPage: true,
    });
  });

  test("renders embed code section", async ({ mockedPage }) => {
    await mockedPage.goto("booking-widget");

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
    await mockedPage.goto("booking-widget");

    const previewArea = mockedPage.getByText("Widget Preview");
    await expect(previewArea).toBeVisible();
  });
});
