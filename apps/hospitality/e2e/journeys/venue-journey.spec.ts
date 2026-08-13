import { test, expect } from "@playwright/test";
import {
  authenticateAgainstLiveSite,
  deleteVenue,
  listSyntheticVenues,
  sweepSyntheticVenues,
  SYNTHETIC_VENUE_PREFIX,
} from "./journey-api.js";
import { createJourneyRecorder, resolveRunContext } from "./journey-recorder.js";

/**
 * Daily synthetic venue-onboarding journey against the LIVE hospitality site.
 *
 * Runs only from .github/workflows/venue-journey.yml — the PR-time E2E suite
 * excludes this directory (playwright.config.ts `testIgnore`) because this spec
 * writes to production data.
 *
 * Contract: every run leaves prod exactly as it found it. Leftovers from
 * aborted runs are swept at the start, and the venue created here is deleted in
 * a cleanup step that runs even when the wizard breaks mid-flight.
 */
test("venue onboarding journey against the live site", async ({ page }) => {
  const { runId } = resolveRunContext();
  const venueName = `${SYNTHETIC_VENUE_PREFIX}${runId}`;
  const journey = createJourneyRecorder(page, venueName);
  let accessToken = "";

  await journey.step("Authenticate", async () => {
    accessToken = await authenticateAgainstLiveSite(page);
    await expect(page.getByTestId("auth-layout")).toBeVisible();
  });

  await journey.step("Sweep leftover synthetic venues", async () => {
    const undeleted = await sweepSyntheticVenues(accessToken);
    for (const name of undeleted) {
      journey.note(`Leftover synthetic venue could not be deleted: ${name}`);
    }
  });

  await journey.step("Open the onboarding wizard", async () => {
    await page.goto("onboarding");
    await expect(page.getByLabel("Venue Name")).toBeVisible();
  });

  await journey.step("Step 1 — name the venue", async () => {
    // The slug auto-derives from the name (generate-slug.ts); assert it landed
    // so a change to that derivation surfaces here rather than at launch.
    await page.getByLabel("Venue Name").fill(venueName);
    await expect(page.getByLabel("Slug")).toHaveValue(venueName);
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByLabel("Timezone")).toBeVisible();
  });

  await journey.step("Step 2 — location and time", async () => {
    await page.getByLabel("Timezone").fill("America/New_York");
    await page.getByRole("option", { name: "Eastern Time (America/New_York)" }).click();
    await expect(page.getByLabel("Currency")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
  });

  await journey.step("Step 3 — operating hours", async () => {
    // Rialto's Checkbox hides the native input behind a decorative box, so the
    // click must be forced and the resulting state asserted (see onboarding.spec.ts).
    const monday = page.getByRole("checkbox", { name: "monday", exact: true });
    await monday.check({ force: true });
    await expect(monday).toBeChecked();
    await page.getByRole("button", { name: "Next" }).click();
  });

  await journey.step("Step 4 — accept the recommended settings", async () => {
    // The one-click smart-default action (#3443) fills the defaults AND advances.
    await page.getByRole("button", { name: "Use recommended settings" }).click();
    await expect(page.getByRole("button", { name: "Launch Venue" })).toBeVisible();
  });

  await journey.step("Step 5 — launch the venue", async () => {
    await page.getByRole("button", { name: "Launch Venue" }).click();
    // LaunchStep celebrates before handing off to the dashboard (#3444). Scope
    // to the celebration container: the PRE-launch review caption reads
    // "Review your venue details — you're ready to take reservations." and
    // stays mounted during submit, so an unscoped getByText (substring,
    // case-insensitive) would pass even when venue creation FAILED. The
    // celebration is the only role="status" on this page — the toast container
    // is role="region" and the wizard's other live regions are unmounted here.
    await expect(
      page.getByRole("status").getByText("You're ready to take reservations")
    ).toBeVisible();
  });

  await journey.step("Dashboard handoff renders for the new venue", async () => {
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    // Mounts only once useDashboardStatsQuery resolves (HomePage renders
    // Skeletons while loading) — covered by the config's 30 s expect timeout.
    //
    // Scoped by ROLE, not by label alone: rialto's Odometer deliberately puts
    // the accessible name on BOTH its wrapper div and its inner
    // role="status" live region (Odometer.test.tsx locks in both halves of
    // that contract), so `getByLabel("Today's Reservations")` resolves to two
    // nodes and fails Playwright strict mode. The wrapper is role-less, so
    // naming the status region picks exactly one. apps/hospitality's own
    // StatRow unit tests mock Odometer down to a single node, which is why
    // this only ever reproduces against the real DOM.
    await expect(page.getByRole("status", { name: "Today's Reservations" })).toBeVisible();
  });

  // Runs even when the wizard broke: the venue may already exist in prod. The
  // `finally` means a test-level timeout still leaves a report behind for the
  // workflow to turn into an issue.
  try {
    await journey.cleanupStep("Delete the synthetic venue", async () => {
      if (!accessToken) return;
      const created = (await listSyntheticVenues(accessToken)).filter(
        (venue) => venue.name === venueName
      );
      for (const venue of created) {
        const deleted = await deleteVenue(accessToken, venue.id);
        if (!deleted) throw new Error(`Venue ${venue.name} (${venue.id}) could not be deleted`);
      }
      expect(
        (await listSyntheticVenues(accessToken)).some((venue) => venue.name === venueName)
      ).toBe(false);
    });
  } finally {
    journey.write();
  }

  journey.assertGreen();
});
