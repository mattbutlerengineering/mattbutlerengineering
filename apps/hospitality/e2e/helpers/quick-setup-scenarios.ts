import type { Locator, Page } from "@playwright/test";

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

/**
 * Day checkboxes are clicked by their label text: the checkbox input itself is visually hidden and a
 * forced click on it can land on the drawer's chrome without toggling.
 *
 * The PRD demo week through the quick-setup rows: Lunch Mon–Fri, Dinner Tue–Sun closing 12:00 AM
 * Fri–Sat, Brunch Sat–Sun. The same rows serve quick setup and the Schedules tab's New schedule,
 * so `scope` is the page for the first and the drawer for the second. It does not save.
 */
export async function setDemoWeek(page: Page, scope: Page | Locator = page) {
  await scope.getByRole("button", { name: "Lunch" }).click();
  await scope.getByRole("button", { name: "Every day" }).click();
  await scope.getByRole("button", { name: "Different days for this service" }).click();
  await scope
    .getByRole("group", { name: "Lunch runs on" })
    .getByRole("button", { name: "Weekdays" })
    .click();

  await scope.getByRole("button", { name: "Add another service" }).click();
  await scope.getByRole("button", { name: "Dinner" }).last().click();
  await scope.getByRole("button", { name: "Different days for this service" }).last().click();
  await scope
    .getByRole("group", { name: "Dinner runs on" })
    .getByText("Monday", { exact: true })
    .click();
  await scope.getByRole("button", { name: "Different hours on some days" }).last().click();
  const later = scope.getByRole("group", { name: "Dinner: different hours" });
  await later.getByText("Fri", { exact: true }).click();
  await later.getByText("Sat", { exact: true }).click();
  await later.getByRole("combobox", { name: "Closes" }).click();
  await page
    .getByRole("listbox", { name: "Closes" })
    .getByRole("option", { name: "12:00 AM", exact: true })
    .click();

  await scope.getByRole("button", { name: "Add another service" }).click();
  await scope.getByRole("button", { name: "Brunch" }).last().click();
  await scope.getByRole("button", { name: "Different days for this service" }).last().click();
  await scope
    .getByRole("group", { name: "Brunch runs on" })
    .getByRole("button", { name: "Weekends" })
    .click();
}
