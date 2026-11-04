import { test, expect } from "./fixtures.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";
import { countInteractions } from "./helpers/interaction-counter.js";
import {
  UNIFORM_BISTRO_BASELINE,
  setDemoWeek,
  setUniformBistroWeek,
} from "./helpers/quick-setup-scenarios.js";

/**
 * Interaction guards (architecture.md decision f). Each test counts the Locator actions a
 * scenario issues through `countInteractions` and compares the count with the baseline measured
 * on the quick-setup form before any UI change of this run (`quick-setup-scenarios.ts`).
 *
 * The counts are AGENT STAND-IN evidence: a count of Playwright actions on a local run with a
 * synthetic OIDC session (auth.setup.ts skipped; no Auth0 E2E creds locally). They are not the
 * Owner's human-timed walkthrough, which no test here claims to have run or passed.
 */
interface DinnerRow {
  readonly weekdays: readonly number[];
  readonly dayHours: { readonly sets: ReadonlyArray<{ readonly weekdays: readonly number[] }> };
}

test.describe("Interaction guards (agent stand-in counts)", () => {
  test("the uniform bistro week takes no more interactions than the recorded baseline", async ({
    mockedPage,
  }) => {
    const state = await mockEmptyVenue(mockedPage);
    await mockedPage.goto("availability");
    const counter = countInteractions(mockedPage);

    await setUniformBistroWeek(counter.page);

    await expect(mockedPage.getByRole("grid")).toBeVisible();
    expect(state.savedBody()).toMatchObject({ expectedVersion: 3 });
    expect(counter.count()).toBeLessThanOrEqual(UNIFORM_BISTRO_BASELINE);
  });

  test("the demo week takes fewer interactions in quick setup than quick setup then New schedule", async ({
    mockedPage,
  }) => {
    // Quick setup only: the week is entered once, with each service's own days and hours.
    const direct = await mockEmptyVenue(mockedPage);
    await mockedPage.goto("availability");
    const quickSetup = countInteractions(mockedPage);
    await setDemoWeek(quickSetup.page);
    await quickSetup.page.getByRole("button", { name: "Save and open bookings" }).click();
    await expect(mockedPage.getByRole("grid")).toBeVisible();
    expect(direct.savedBody()).toMatchObject({ expectedVersion: 3 });

    // Quick setup first, then the Schedules tab's New schedule for the week that differs. The
    // same wrapper counts it on the same empty-venue fixture, mocked afresh (the later route wins)
    // and reloaded so the page holds no state from the first path.
    const viaSchedules = await mockEmptyVenue(mockedPage);
    await mockedPage.goto("availability");
    const second = mockedPage;
    const counter = countInteractions(second);
    await setUniformBistroWeek(counter.page);
    await expect(second.getByRole("grid")).toBeVisible();
    expect(viaSchedules.savedBody()).toMatchObject({ expectedVersion: 3 });
    await counter.page.getByRole("button", { name: "Create another schedule…" }).click();
    await counter.page.getByRole("button", { name: "New schedule" }).click();
    const drawer = counter.page.getByRole("dialog");
    await drawer.getByRole("textbox", { name: /Schedule name/ }).fill("Demo week");
    await setDemoWeek(counter.page, drawer);
    await drawer.getByRole("button", { name: "Save", exact: true }).click();
    await expect(second.getByText("Demo week saved")).toBeVisible();

    // Both paths entered the same week: Dinner Tue–Sun, closing later on Fri and Sat (the base hours
    // keep Tue–Thu and Sun, the set carries Fri and Sat).
    const dinner = (body: Record<string, unknown> | null) => {
      const rows = (body?.changes as { upsert: { scheduleServices?: DinnerRow[] } }).upsert
        .scheduleServices;
      return rows?.find((row) => row.dayHours.sets.length > 0);
    };
    for (const body of [direct.savedBody(), viaSchedules.savedBody()]) {
      expect(dinner(body)?.dayHours.sets.map((set) => set.weekdays)).toEqual([[5, 6]]);
      expect(dinner(body)?.weekdays).toEqual([2, 3, 4, 0]);
    }

    test.info().annotations.push({
      type: "interactions (agent stand-in)",
      description: `quick setup ${quickSetup.count()}, quick setup then New schedule ${counter.count()}`,
    });
    expect(quickSetup.count()).toBeLessThan(counter.count());
  });
});
