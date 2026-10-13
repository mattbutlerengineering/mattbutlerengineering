import { test, expect } from "./fixtures.js";

/**
 * Fold-budget measurement (#6367, WO-1): records where each page's
 * primary-content region starts, in viewport pixels, at the two laptop
 * sizes named in prd.md. No assertions yet — the guard lands in WO-4 once
 * WO-2/WO-3 have had a chance to pull the number up. Output doubles as the
 * BEFORE column of docs/features/hospitality-above-fold-usability/audit.md.
 */

const VIEWPORTS = [
  { label: "1280x720", width: 1280, height: 720 },
  { label: "1366x768", width: 1366, height: 768 },
] as const;

// Route path (relative to baseURL) per page. Six are the PRD-1 key pages;
// the rest round out "every route" for the audit.
const ROUTES: readonly { page: string; path: string }[] = [
  { page: "HomePage", path: "dashboard" },
  { page: "ReservationsPage", path: "reservations" },
  { page: "GuestsPage", path: "guests" },
  { page: "TimelinePage", path: "timeline" },
  { page: "FloorPlansPage", path: "floor-plans" },
  { page: "WaitlistPage", path: "waitlist" },
  { page: "ProfilePage", path: "profile" },
  { page: "SettingsPage", path: "settings" },
];

test.describe("Fold budget measurement", () => {
  for (const { page: pageName, path } of ROUTES) {
    for (const viewport of VIEWPORTS) {
      test(`${pageName} @ ${viewport.label}`, async ({ mockedPage }, testInfo) => {
        await mockedPage.setViewportSize({ width: viewport.width, height: viewport.height });
        await mockedPage.goto(path);

        const primaryContent = mockedPage.getByTestId("primary-content");
        await expect(primaryContent).toBeVisible();

        const contentStartY = await primaryContent.evaluate((el) => el.getBoundingClientRect().top);

        // No assertion yet (WO-1 is measurement-only) — attach for audit.md.
        await testInfo.attach(`fold-budget-${pageName}-${viewport.label}`, {
          body: JSON.stringify({ page: pageName, path, viewport: viewport.label, contentStartY }),
          contentType: "application/json",
        });

        expect(typeof contentStartY).toBe("number");
      });
    }
  }
});
