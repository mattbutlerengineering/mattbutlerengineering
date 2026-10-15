import { test, expect } from "./fixtures.js";

/**
 * Fold-budget measurement + guard (#6367, WO-1/WO-4): records where each
 * page's primary-content region starts, in viewport pixels, at the two
 * laptop sizes named in prd.md, and attaches the reading for
 * docs/features/hospitality-above-fold-usability/audit.md. The six PRD-1 key
 * pages are additionally gated at 1280×720: content-start-Y must stay under
 * the fold (720px) once DashboardLayout's padding (WO-2) and any per-page
 * header tightening (WO-3) are in place. Non-key routes, and the key pages'
 * 1366×768 reading, stay report-only — no live tree has ever been measured
 * past that size and the PRD only commits SC-1..SC-4 against 1280×720.
 */

const VIEWPORTS = [
  { label: "1280x720", width: 1280, height: 720 },
  { label: "1366x768", width: 1366, height: 768 },
] as const;

const FOLD_BUDGET_PX = 720;
const GUARD_VIEWPORT_LABEL = "1280x720";

// Route path (relative to baseURL) per page. Six are the PRD-1 key pages;
// the rest round out "every route" for the audit.
const ROUTES: readonly { page: string; path: string; guarded: boolean }[] = [
  { page: "HomePage", path: "dashboard", guarded: true },
  { page: "ReservationsPage", path: "reservations", guarded: true },
  { page: "GuestsPage", path: "guests", guarded: true },
  { page: "TimelinePage", path: "timeline", guarded: true },
  { page: "FloorPlansPage", path: "floor-plans", guarded: true },
  { page: "WaitlistPage", path: "waitlist", guarded: true },
  { page: "ProfilePage", path: "profile", guarded: false },
  { page: "SettingsPage", path: "settings", guarded: false },
];

test.describe("Fold budget measurement", () => {
  for (const { page: pageName, path, guarded } of ROUTES) {
    for (const viewport of VIEWPORTS) {
      test(`${pageName} @ ${viewport.label}`, async ({ mockedPage }, testInfo) => {
        await mockedPage.setViewportSize({ width: viewport.width, height: viewport.height });
        await mockedPage.goto(path);

        const primaryContent = mockedPage.getByTestId("primary-content");
        await expect(primaryContent).toBeVisible();

        const contentStartY = await primaryContent.evaluate((el) => el.getBoundingClientRect().top);

        // Attach for audit.md regardless of guard status.
        await testInfo.attach(`fold-budget-${pageName}-${viewport.label}`, {
          body: JSON.stringify({ page: pageName, path, viewport: viewport.label, contentStartY }),
          contentType: "application/json",
        });

        expect(typeof contentStartY).toBe("number");

        // WO-4 guard: key pages must clear the fold at 1280×720. Non-key
        // routes and the 1366×768 reading stay report-only (see header note).
        if (guarded && viewport.label === GUARD_VIEWPORT_LABEL) {
          expect(contentStartY).toBeLessThan(FOLD_BUDGET_PX);
        }
      });
    }
  }
});
