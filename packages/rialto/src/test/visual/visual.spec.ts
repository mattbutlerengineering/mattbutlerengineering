/**
 * Visual Regression Tests — Rialto Storybook Stories
 *
 * Each entry captures one story per component and compares it against a
 * committed baseline PNG in __screenshots__/. Pixel-diff tolerance: 1%.
 *
 * Story IDs follow Storybook's naming convention:
 *   kebab-case(meta.title).replace("/", "-") + "--" + kebab-case(exportName)
 *
 * Update baselines after intentional visual changes:
 *   pnpm --dir packages/rialto test:visual:update
 *
 * NOTE: Baselines were generated on macOS (chromium). Linux CI uses a different
 * font-rendering stack — if CI fails on font metrics, regenerate with:
 *   pnpm --dir packages/rialto test:visual:update   (in CI environment)
 */

import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";

// One default/primary story per component – covers all 53 story files.
// `selector` overrides the default "#storybook-root" target for stories that
// render their visible content via a portal (e.g. full-page overlays).
const STORIES: Array<{ id: string; label: string; selector?: string }> = [
  { id: "layout-accordion--single-expand", label: "Accordion" },
  { id: "feedback-alert--default", label: "Alert" },
  { id: "layout-appbar--default", label: "AppBar" },
  { id: "forms-autocomplete--default", label: "Autocomplete" },
  { id: "display-avatar--default", label: "Avatar" },
  { id: "display-badge--default", label: "Badge" },
  { id: "feedback-banner--default", label: "Banner" },
  { id: "foundation-button--primary", label: "Button" },
  { id: "foundation-card--default", label: "Card" },
  { id: "forms-checkbox--unchecked", label: "Checkbox" },
  // CommandPalette renders via portal when open — screenshot the full viewport
  { id: "specialty-commandpalette--open", label: "CommandPalette", selector: "html" },
  { id: "overlay-confirmdialog--default", label: "ConfirmDialog" },
  { id: "overlay-contextmenu--default", label: "ContextMenu" },
  { id: "data-display-datalist--default", label: "DataList" },
  { id: "overlay-dialog--default", label: "Dialog" },
  { id: "data-display-divider--default", label: "Divider" },
  { id: "overlay-drawer--right", label: "Drawer" },
  { id: "overlay-dropdownmenu--default", label: "DropdownMenu" },
  { id: "feedback-emptystate--default", label: "EmptyState" },
  { id: "specialty-footer--minimal", label: "Footer" },
  { id: "layout-globalnav--default", label: "GlobalNav" },
  { id: "foundation-heading--default", label: "Heading" },
  { id: "specialty-hero--default", label: "Hero" },
  { id: "feedback-hovercard--default", label: "HoverCard" },
  { id: "specialty-imageupload--default", label: "ImageUpload" },
  { id: "form-input--default", label: "Input" },
  { id: "forms-inputgroup--input-with-button", label: "InputGroup" },
  { id: "specialty-kbd--default", label: "Kbd" },
  { id: "feedback-meter--default", label: "Meter" },
  { id: "layout-navigationmenu--horizontal", label: "NavigationMenu" },
  { id: "forms-numberinput--default", label: "NumberInput" },
  { id: "layout-pageheader--title-only", label: "PageHeader" },
  { id: "forms-pininput--four-digit", label: "PinInput" },
  { id: "overlay-popover--default", label: "Popover" },
  { id: "feedback-progress--default", label: "Progress" },
  { id: "specialty-scrollarea--default", label: "ScrollArea" },
  { id: "forms-segmentedcontrol--two-segments", label: "SegmentedControl" },
  { id: "forms-select--default", label: "Select" },
  { id: "feedback-skeleton--default", label: "Skeleton" },
  { id: "forms-slider--default", label: "Slider" },
  { id: "layout-stack--vertical", label: "Stack" },
  { id: "data-display-stat--default", label: "Stat" },
  { id: "data-display-table--default", label: "Table" },
  { id: "data-display-tag--default", label: "Tag" },
  { id: "data-display-tapechart--default", label: "TapeChart" },
  { id: "foundation-text--default", label: "Text" },
  { id: "form-textarea--default", label: "TextArea" },
  { id: "specialty-themetoggle--light", label: "ThemeToggle" },
  { id: "data-display-timeline--default", label: "Timeline" },
  { id: "overlay-toast--success", label: "Toast" },
  { id: "form-toggle--default", label: "Toggle" },
  { id: "feedback-tooltip--default", label: "Tooltip" },
  { id: "data-display-tree--default", label: "Tree" },
];

/**
 * Navigate to a Storybook story iframe and disable all animations so
 * screenshots are deterministic across runs.
 */
async function loadStory(page: Page, storyId: string): Promise<void> {
  // Inject animation-killer before the page loads so no keyframes fire
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = [
      "*, *::before, *::after {",
      "  animation-duration: 0s !important;",
      "  animation-delay: 0s !important;",
      "  transition-duration: 0s !important;",
      "  transition-delay: 0s !important;",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  });
  // Tell framer-motion to skip all motion
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
  // Wait for fonts + lazy images to settle
  await page.waitForLoadState("networkidle");
}

for (const story of STORIES) {
  test(`${story.label} / ${story.id}`, async ({ page }) => {
    await loadStory(page, story.id);
    const target = page.locator(story.selector ?? "#storybook-root");
    await expect(target).toHaveScreenshot(`${story.id}.png`);
  });
}
