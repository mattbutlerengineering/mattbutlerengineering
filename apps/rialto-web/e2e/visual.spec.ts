/**
 * Visual Regression Tests
 *
 * Screenshots each component section on the /visual-test harness page.
 * Baselines live in e2e/screenshots/ and are committed to git.
 *
 * Update baselines: npx playwright test --update-snapshots
 */

import { test, expect } from "@playwright/test";

/* ── Shared setup ──────────────────────────────── */

test.beforeEach(async ({ page }) => {
  // Force reduced motion BEFORE navigation so animations never start
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("visual-test");
  await page.waitForLoadState("networkidle");
});

/* ── Light mode sections ───────────────────────── */

const lightSections = [
  "button-variants",
  "button-sizes",
  "input-states",
  "textarea-states",
  "numberinput-states",
  "select-states",
  "toggle-states",
  "checkbox-states",
  "segmentedcontrol-default",
  "slider-states",
  "tabs-default",
  "accordion-default",
  "card-variants",
  "alert-variants",
  "banner-variants",
  "badge-variants",
  "tag-variants",
  "avatar-variants",
  "avatargroup-default",
  "table-default",
  "table-empty",
  "datalist-default",
  "progress-states",
  "meter-variants",
  "skeleton-variants",
  "steps-default",
  "breadcrumb-default",
  "emptystate-default",
  "stat-variants",
  "tooltip-default",
  "pagination-default",
  "dialog-open",
  "drawer-open",
  "tape-chart-default",
  "tape-chart-stress",
] as const;

for (const id of lightSections) {
  test(`light / ${id}`, async ({ page }) => {
    const section = page.getByTestId(id);
    await expect(section).toHaveScreenshot(`light-${id}.png`, {
      timeout: 15_000,
    });
  });
}

/* ── Dark mode sections ────────────────────────── */

const darkSections = [
  "dark-buttons",
  "dark-inputs",
  "dark-alerts",
  "dark-toggles",
  "dark-badges",
  "dark-cards",
  "dark-banner",
  "dark-avatar",
  "dark-tape-chart",
] as const;

for (const id of darkSections) {
  test(`dark / ${id}`, async ({ page }) => {
    const section = page.getByTestId(id);
    await expect(section).toHaveScreenshot(`dark-${id}.png`, {
      timeout: 15_000,
    });
  });
}
