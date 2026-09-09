import { test, expect } from "@playwright/test";
import {
  authenticateAgainstLiveSite,
  authenticateNonAdmin,
  createVenueAs,
  deleteVenue,
  isNonAdminAuthConfigured,
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
  // Every venue this run creates, so cleanup covers the non-admin ones too.
  // Seeded with the wizard's venue; the bootstrap case appends to it.
  const createdVenueNames: string[] = [venueName];

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
    // Scoped to the picker's radiogroup, not by "Floor Plan"/"Floor plan"
    // text — the desktop step rail (VerticalStepRail) renders every step's
    // label, including "Floor plan", for the whole wizard, and Playwright's
    // default text match is case-insensitive: an unscoped getByText would
    // resolve to both the rail label and this step's own heading.
    await expect(page.getByRole("radiogroup", { name: "Floor plan layout" })).toBeVisible();
  });

  await journey.step("Step 5 — pick a floor plan template", async () => {
    // DOM only — never drive the Konva canvas from Playwright (FloorPlanStep.test.tsx
    // pins drag-snap at the unit level, which is where that belongs). "Blank"
    // keeps this daily prod-writing journey's footprint to the venue, the
    // plan, and an activate call — no per-table POSTs — and gives the
    // celebration step below a fixed, non-interpolated sentence to assert.
    await page.getByRole("radio", { name: "Blank — no tables" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("button", { name: "Launch Venue" })).toBeVisible();
  });

  await journey.step("Step 6 — launch the venue", async () => {
    await page.getByRole("button", { name: "Launch Venue" }).click();
    // LaunchStep celebrates before handing off to the floor plan editor
    // (#3444, #4761). Scope to the celebration container: the PRE-launch
    // review caption reads "Review your venue details — you're ready to
    // take reservations." and stays mounted during submit, so an unscoped
    // getByText (substring, case-insensitive) would pass even when venue
    // creation FAILED. The celebration is the only role="status" on this
    // page — the toast container is role="region" and the wizard's other
    // live regions are unmounted here.
    await expect(
      page.getByRole("status").getByText("Your venue is live — add tables next")
    ).toBeVisible();
  });

  await journey.step("Handoff renders the new venue's floor plan editor", async () => {
    await expect(page).toHaveURL(/\/floor-plans\/[^/]+$/);
    // "Blank" template's plan is named "Main Floor" (floor-plan-templates.ts)
    // — fixed per template, not user-editable in the wizard.
    await expect(page.getByRole("heading", { name: "Main Floor" })).toBeVisible();
    // The Launch sequence always activates the plan it creates (the
    // "activate" stage runs regardless of table count), so the editor shows
    // the Active badge as soon as it lands. No table is ever selected in
    // this journey, so this is the only "Active" text on the page — the
    // per-table status badge in the (unopened) details sidebar reads
    // "Active" only once a table is selected.
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
  });

  // Deliberately LAST: a failed step marks every later step skipped, so an
  // unprovisioned non-admin account here must not wipe out the wizard
  // coverage above. Cleanup still runs — it is outside the step chain.
  const NON_ADMIN_STEP_NAME = "A non-admin identity can bootstrap its first venue";
  if (isNonAdminAuthConfigured()) {
    await journey.step(NON_ADMIN_STEP_NAME, async () => {
      // ADR-020's third case. Runs against a SEPARATE, deliberately non-admin
      // account: the admin identity above takes requireVenueCreateAccess's
      // skip-the-lookup branch, so it would exercise none of this.
      const nonAdmin = await authenticateNonAdmin();

      // Assert the identity, not just the outcome. If this account is ever
      // granted the admin role, every assertion below would still pass — via the
      // admin branch — and the bootstrap path would silently stop being covered.
      expect(
        nonAdmin.permissions,
        "the non-admin journey account must NOT hold the admin permission, or this case proves nothing"
      ).not.toContain("admin");

      const first = await createVenueAs(nonAdmin.accessToken, `${venueName}-bootstrap`);
      createdVenueNames.push(`${venueName}-bootstrap`);
      expect(first.status).toBe(201);

      // The invariant: the relaxation is for the FIRST venue only.
      const second = await createVenueAs(nonAdmin.accessToken, `${venueName}-second`);
      createdVenueNames.push(`${venueName}-second`);
      expect(second.status).toBe(403);
    });
  } else {
    // Environmental, not a code defect — E2E_NONADMIN_AUTH_EMAIL/PASSWORD were
    // never provisioned (#4527, blocked on a human: creating the Auth0 test
    // account). Skipping (not failing) stops this from hard-failing the whole
    // journey daily over a gap no agent can close; the friction-log note keeps
    // the gap visible without filing a repeat `ready` issue.
    journey.note(
      `${NON_ADMIN_STEP_NAME}: skipped — E2E_NONADMIN_AUTH_EMAIL/PASSWORD are not configured. See #4527.`
    );
    journey.skip(NON_ADMIN_STEP_NAME);
  }

  // Runs even when the wizard broke: the venue may already exist in prod. The
  // `finally` means a test-level timeout still leaves a report behind for the
  // workflow to turn into an issue.
  try {
    await journey.cleanupStep("Delete the synthetic venues", async () => {
      if (!accessToken) return;
      // Deletes with the ADMIN token: DELETE /venues/:id still requires the
      // admin role, and deliberately so — only creation was relaxed. The venue
      // cascade removes the owner VenueMembership, which is what makes the
      // bootstrap case above repeatable on the next run.
      const created = (await listSyntheticVenues(accessToken)).filter((venue) =>
        createdVenueNames.includes(venue.name)
      );
      for (const venue of created) {
        const result = await deleteVenue(accessToken, venue.id);
        if (!result.ok) {
          throw new Error(
            `Venue ${venue.name} (${venue.id}) could not be deleted (HTTP ${result.status})`
          );
        }
      }
      const remaining = (await listSyntheticVenues(accessToken)).filter((venue) =>
        createdVenueNames.includes(venue.name)
      );
      expect(remaining.map((venue) => venue.name)).toEqual([]);
    });
  } finally {
    journey.write();
  }

  journey.assertGreen();
});
