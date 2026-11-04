import type { Page } from "@playwright/test";

/**
 * Quick-setup scenarios the interaction counter measures (architecture.md decision f). Each runs
 * on an empty venue (`mockEmptyVenue`) through a counted page and ends at the saved week.
 *
 * Baselines were measured against the UNCHANGED quick-setup form, before any UI item of
 * feature:availability-config-usability landed. Later guards assert "no more than" these.
 */
export const UNIFORM_BISTRO_BASELINE = 5;
export const LARGE_SETUP_BASELINE = 13;

async function chooseTime(page: Page, serviceIndex: number, label: string, time: string) {
  await page.getByRole("combobox", { name: label }).nth(serviceIndex).click();
  await page
    .getByRole("listbox", { name: label })
    .getByRole("option", { name: time, exact: true })
    .click();
}

/** Uniform bistro: Lunch and Dinner from the presets, both Mon–Fri. */
export async function setUniformBistroWeek(page: Page) {
  await page.getByRole("button", { name: "Lunch" }).click();
  await page.getByRole("button", { name: "Add another service" }).click();
  await page.getByRole("button", { name: "Dinner" }).last().click();
  await page.getByRole("button", { name: "Weekdays" }).click();
  await page.getByRole("button", { name: "Save and open bookings" }).click();
}

/**
 * The large multi-service fixture (none existed in apps/hospitality/e2e): four services in a
 * multi-room restaurant, every day. Brunch and Dinner from the presets, a named afternoon
 * Tasting Menu with its own opening and closing, and Late from its preset.
 */
export async function setLargeSetup(page: Page) {
  await page.getByRole("button", { name: "Brunch" }).click();
  await page.getByRole("button", { name: "Add another service" }).click();
  await page.getByRole("button", { name: "Dinner" }).last().click();
  await page.getByRole("button", { name: "Add another service" }).click();
  await page.getByRole("textbox", { name: /name/i }).last().fill("Tasting Menu");
  await chooseTime(page, 2, "Opens", "3:00 PM");
  await chooseTime(page, 2, "Closes", "4:30 PM");
  await page.getByRole("button", { name: "Add another service" }).click();
  await page.getByRole("button", { name: "Late" }).last().click();
  await page.getByRole("button", { name: "Every day" }).click();
  await page.getByRole("button", { name: "Save and open bookings" }).click();
}
