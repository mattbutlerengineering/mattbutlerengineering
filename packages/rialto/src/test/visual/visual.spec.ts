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
 * NOTE: Rendering is hermetic — the Storybook preview loads vendored woff2
 * fonts (.storybook/fonts/), never the network or OS fallback fonts. Baselines
 * are Linux CI renders; macOS renders differ (antialiasing) and must never be
 * committed. To regenerate after an intentional visual change: push, let the
 * rialto-visual workflow fail, download its `visual-regression-diffs`
 * artifact, and copy the `*-actual.png` files over the failing baselines
 * (see #3303/#3305 for the sanctioned flow).
 *
 * NOTE: This harness does NOT rely on Storybook's play() autorun (broke in
 * Storybook 10.5.0 — see #3518). Stories whose interacted state is part of
 * the baseline (focus rings, opened overlays, typed values) get their
 * interaction driven explicitly via Playwright below, after loadStory() and
 * before the screenshot. play() functions still run for Storybook's own test
 * runner; they are just no longer load-bearing for this harness.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";

/**
 * Chromium tracks a page-global input modality (pointer vs. keyboard) and
 * suppresses the :focus-visible ring for focus that followed a pointer
 * click — even for an element focused programmatically afterwards. A real
 * Tab away and Shift+Tab back is the unambiguous, spec-guaranteed way to
 * flip the modality to "keyboard": Shift+Tab always returns focus to
 * exactly where Tab left it, so the originally-focused element ends up
 * re-focused via genuine keyboard navigation and renders its ring. The
 * baselines (captured via testing-library, which drives real focus) show
 * that ring, so replicate it here.
 */
async function makeFocusVisible(page: Page): Promise<void> {
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
}

/**
 * Variant of makeFocusVisible() for interactions where the ring belongs on
 * the very element that was just pointer-clicked, rather than on some other
 * element reached via Tab (see #3531). Two things a real (trusted) pointer
 * click does that testing-library's synthetic click — which is what the
 * baselines were captured with — never does:
 *
 * 1. Tab/Shift+Tab only produces a genuine blur->focus transition when
 *    there is a *different* element for Tab to land on first; on a page
 *    whose only reachable stop is the element itself, no such transition
 *    fires and the modality never flips. Blurring first (so
 *    document.activeElement genuinely changes to null) then Shift+Tab-ing
 *    back is reliable instead: Chromium's sequential-focus-navigation
 *    position anchors to the element that was last reached via trusted
 *    input (the click that just happened), so Shift+Tab from a blurred
 *    state always returns focus to that same element via a genuine
 *    keyboard transition.
 * 2. It leaves the OS-tracked pointer resting on the element, so :hover
 *    keeps matching afterward. Several variants (Button primary/secondary)
 *    define their own :hover box-shadow with the same specificity as
 *    :focus-visible's — whichever rule is later in the compiled stylesheet
 *    wins the tie, which visually replaces the focus ring with the hover
 *    glow. Moving the mouse off the element clears :hover so the
 *    focus-visible ring renders as it does in the baseline.
 */
async function makeFocusVisibleOnSelf(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Shift+Tab");
  await page.mouse.move(0, 0);
}

async function interactButtonPrimary(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Primary Action" });
  await button.click();
  await makeFocusVisibleOnSelf(page);
}

async function interactConfirmDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Confirm Action" }).click();
  // ConfirmDialog renders via Dialog, whose panel role is "dialog" (it does
  // not set role="alertdialog"); the confirm button gets auto-focused after
  // a 50ms delay, so wait on that rather than a fixed sleep.
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm", exact: true })).toBeFocused();
}

async function interactDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open Dialog" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function interactDrawer(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open Drawer" }).click();
  // useFocusTrap focuses the first focusable descendant (the close button)
  // in a passive effect, which can run after the click's own microtask —
  // wait for it explicitly instead of racing the screenshot against it.
  await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
  await makeFocusVisible(page);
}

async function interactDropdownMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByText("Edit")).toBeVisible();
}

async function interactInput(page: Page): Promise<void> {
  await page.getByPlaceholder("Enter text...").fill("Hello World");
}

async function interactPopover(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Options" }).click();
  await expect(page.getByText("Filter Settings")).toBeVisible();
}

async function interactTableSort(page: Page): Promise<void> {
  await page.getByRole("columnheader", { name: /Points/i }).click();
}

async function interactTextArea(page: Page): Promise<void> {
  await page.getByPlaceholder("Enter details...").fill("Hello World");
}

async function interactToastSuccess(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Show Success Toast" });
  await button.click();
  await expect(page.getByText("Success!")).toBeVisible();
  await makeFocusVisibleOnSelf(page);
}

async function interactToggle(page: Page): Promise<void> {
  // The visible track is a sibling <label htmlFor> overlapping the
  // visually-hidden <input>, so a real pointer click on the input's own
  // bounding box is intercepted — force the click straight onto the input,
  // same as jsdom's synthetic click in the story's own play().
  const toggle = page.getByRole("switch");
  await toggle.click({ force: true });
  await makeFocusVisible(page);
}

// One default/primary story per component – covers all 53 story files.
// `selector` overrides the default "#storybook-root" target for stories that
// render their visible content via a portal (e.g. full-page overlays).
// `interact` replicates the story's play() interaction so the baseline's
// interacted state (focus ring, opened overlay, typed value, …) still
// renders — see the file-level NOTE above.
const STORIES: Array<{
  id: string;
  label: string;
  selector?: string;
  interact?: (page: Page) => Promise<void>;
}> = [
  { id: "layout-accordion--single-expand", label: "Accordion" },
  { id: "feedback-alert--default", label: "Alert" },
  { id: "layout-appbar--default", label: "AppBar" },
  { id: "forms-autocomplete--default", label: "Autocomplete" },
  { id: "display-avatar--default", label: "Avatar" },
  { id: "display-badge--default", label: "Badge" },
  { id: "feedback-banner--default", label: "Banner" },
  { id: "foundation-button--primary", label: "Button", interact: interactButtonPrimary },
  { id: "foundation-card--default", label: "Card" },
  { id: "forms-checkbox--unchecked", label: "Checkbox" },
  // CommandPalette renders via portal when open — screenshot the full viewport
  { id: "specialty-commandpalette--open", label: "CommandPalette", selector: "html" },
  { id: "overlay-confirmdialog--default", label: "ConfirmDialog", interact: interactConfirmDialog },
  // ContextMenu's popup is absolutely positioned below the captured
  // "#storybook-root" bounding box, so the baseline was never affected by
  // the story's play() opening it — no interaction needed here either.
  { id: "overlay-contextmenu--default", label: "ContextMenu" },
  { id: "data-display-datalist--default", label: "DataList" },
  { id: "overlay-dialog--default", label: "Dialog", interact: interactDialog },
  { id: "data-display-divider--default", label: "Divider" },
  { id: "overlay-drawer--right", label: "Drawer", interact: interactDrawer },
  { id: "overlay-dropdownmenu--default", label: "DropdownMenu", interact: interactDropdownMenu },
  { id: "feedback-emptystate--default", label: "EmptyState" },
  { id: "specialty-footer--minimal", label: "Footer" },
  { id: "layout-globalnav--default", label: "GlobalNav" },
  { id: "foundation-heading--default", label: "Heading" },
  { id: "specialty-hero--default", label: "Hero" },
  { id: "feedback-hovercard--default", label: "HoverCard" },
  { id: "specialty-imageupload--default", label: "ImageUpload" },
  { id: "form-input--default", label: "Input", interact: interactInput },
  { id: "forms-inputgroup--input-with-button", label: "InputGroup" },
  { id: "specialty-kbd--default", label: "Kbd" },
  { id: "feedback-meter--default", label: "Meter" },
  { id: "layout-navigationmenu--horizontal", label: "NavigationMenu" },
  { id: "forms-numberinput--default", label: "NumberInput" },
  { id: "layout-pageheader--title-only", label: "PageHeader" },
  { id: "forms-pininput--four-digit", label: "PinInput" },
  { id: "overlay-popover--default", label: "Popover", interact: interactPopover },
  { id: "feedback-progress--default", label: "Progress" },
  { id: "specialty-scrollarea--default", label: "ScrollArea" },
  { id: "forms-segmentedcontrol--two-segments", label: "SegmentedControl" },
  { id: "forms-select--default", label: "Select" },
  { id: "feedback-skeleton--default", label: "Skeleton" },
  { id: "forms-slider--default", label: "Slider" },
  { id: "layout-stack--vertical", label: "Stack" },
  { id: "data-display-stat--default", label: "Stat" },
  { id: "data-display-table--default", label: "Table", interact: interactTableSort },
  { id: "data-display-tag--default", label: "Tag" },
  { id: "data-display-tapechart--default", label: "TapeChart" },
  { id: "foundation-text--default", label: "Text" },
  { id: "form-textarea--default", label: "TextArea", interact: interactTextArea },
  { id: "specialty-themetoggle--light", label: "ThemeToggle" },
  { id: "data-display-timeline--default", label: "Timeline" },
  { id: "overlay-toast--success", label: "Toast", interact: interactToastSuccess },
  { id: "form-toggle--default", label: "Toggle", interact: interactToggle },
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
  // Wait for lazy images/network to settle, then for the vendored webfonts —
  // a screenshot taken before fonts.ready would capture fallback glyphs.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

for (const story of STORIES) {
  test(`${story.label} / ${story.id}`, async ({ page }) => {
    await loadStory(page, story.id);
    await story.interact?.(page);
    const target = page.locator(story.selector ?? "#storybook-root");
    await expect(target).toHaveScreenshot(`${story.id}.png`);
  });
}
