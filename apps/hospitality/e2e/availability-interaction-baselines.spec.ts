import { test, expect } from "./fixtures.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";
import { weekPanel } from "./helpers/first-paint.js";
import { countInteractions } from "./helpers/interaction-counter.js";
import {
  LARGE_SETUP_BASELINE,
  UNIFORM_BISTRO_BASELINE,
  setLargeSetup,
  setUniformBistroWeek,
} from "./helpers/quick-setup-scenarios.js";

/**
 * Baselines for the interaction counter, measured on the quick-setup form as it was before any
 * UI change of the availability-config-usability run. Agent stand-in evidence only: a count of
 * Locator actions, not a timed walkthrough. Later guards compare against these constants.
 */
test.describe("Quick-setup interaction baselines", () => {
  test("the uniform bistro week", async ({ mockedPage }) => {
    const state = await mockEmptyVenue(mockedPage);
    await mockedPage.goto("availability");
    const counter = countInteractions(mockedPage);

    await setUniformBistroWeek(counter.page);

    // The save lands on the week panel (Schedules layer), not the calendar.
    await expect(weekPanel(mockedPage)).toBeVisible();
    expect(state.savedBody()).toMatchObject({ expectedVersion: 3 });
    expect(counter.count()).toBe(UNIFORM_BISTRO_BASELINE);
  });

  test("the large multi-service setup", async ({ mockedPage }) => {
    const state = await mockEmptyVenue(mockedPage);
    await mockedPage.goto("availability");
    const counter = countInteractions(mockedPage);

    await setLargeSetup(counter.page);

    // The save lands on the week panel (Schedules layer), not the calendar.
    await expect(weekPanel(mockedPage)).toBeVisible();
    expect(state.savedBody()).toMatchObject({ expectedVersion: 3 });
    expect(counter.count()).toBe(LARGE_SETUP_BASELINE);
  });
});
