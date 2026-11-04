import { test, expect } from "./fixtures.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";
import { countInteractions } from "./helpers/interaction-counter.js";
import { UNIFORM_BISTRO_BASELINE, setUniformBistroWeek } from "./helpers/quick-setup-scenarios.js";

/**
 * Interaction guards (architecture.md decision f). Each test counts the Locator actions a
 * scenario issues through `countInteractions` and compares the count with the baseline measured
 * on the quick-setup form before any UI change of this run (`quick-setup-scenarios.ts`).
 *
 * The counts are AGENT STAND-IN evidence: a count of Playwright actions on a local run with a
 * synthetic OIDC session (auth.setup.ts skipped; no Auth0 E2E creds locally). They are not the
 * Owner's human-timed walkthrough, which no test here claims to have run or passed.
 */
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
});
