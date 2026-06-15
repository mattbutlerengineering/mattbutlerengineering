/**
 * Visual regression tests for rialto Storybook stories.
 *
 * Run:   pnpm --dir packages/rialto test:visual
 * Update baselines: pnpm --dir packages/rialto test:visual --update
 *
 * The test server is configured in playwright.visual.config.ts to serve
 * storybook-static/ at localhost:6007.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RIALTO_DIR = path.resolve(__dirname, "../../..");
const STORYBOOK_BASE_URL = "http://localhost:6007";

/** Pixel-diff tolerance: 1% of total pixels. */
const TOLERANCE = 0.01;

/**
 * Stories that are excluded from visual regression.
 * Overlay/portal components that pop open off-screen, and
 * animation-heavy components that produce non-deterministic pixels.
 */
const SKIP_STORY_IDS = new Set<string>([
  // Overlay/portal components — content renders off-screen or requires interaction
  "overlay-drawer--basic",
  "overlay-drawer--full-screen",
  "overlay-dialog--basic",
  "overlay-confirmationdialog--basic",
  "overlay-confirmationdialog--destructive",
  // Animation-heavy specialty components produce non-deterministic pixels
  "specialty-ferrofluid--default",
  "specialty-flipdot--default",
  "specialty-splitflap--default",
  // Dismissible banners hide themselves after play() fires — no visible content
  "feedback-banner--dismissible",
  "feedback-banner--dismissible-warning",
  "feedback-banner--dismissible-with-action",
  // CommandPalette renders outside #storybook-root (portal to document.body)
  "specialty-commandpalette--closed",
  "specialty-commandpalette--open",
]);

interface StoryEntry {
  id: string;
  type: string;
  title: string;
  name: string;
}

function loadStoryIndex(): StoryEntry[] {
  const indexPath = path.join(RIALTO_DIR, "storybook-static", "index.json");
  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Storybook index not found at ${indexPath}. Run: pnpm --dir packages/rialto build-storybook`
    );
  }
  const raw = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as {
    entries: Record<string, StoryEntry>;
  };
  return Object.values(raw.entries).filter((e) => e.type === "story" && !SKIP_STORY_IDS.has(e.id));
}

async function waitForStoryRender(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  // Use "attached" not "visible" — some stories (e.g. closed overlays) have a
  // hidden root element that is still attached to the DOM.
  await page.waitForSelector("#storybook-root", { state: "attached", timeout: 10_000 });
  // Settle time for CSS transitions after animations are disabled
  await page.waitForTimeout(200);
}

async function captureStoryScreenshot(page: Page, storyId: string): Promise<Buffer> {
  const url = `${STORYBOOK_BASE_URL}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForStoryRender(page);
  const root = page.locator("#storybook-root");
  return root.screenshot({ animations: "disabled" });
}

const stories = loadStoryIndex();

test.describe("Visual regression — rialto Storybook", () => {
  test.beforeEach(async ({ page }) => {
    // Freeze all CSS transitions for deterministic screenshots
    await page.addStyleTag({
      content:
        "*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }",
    });
  });

  for (const story of stories) {
    test(`${story.title} / ${story.name}`, async ({ page }) => {
      const screenshot = await captureStoryScreenshot(page, story.id);
      // Snapshot name is just the story ID — Playwright places it in snapshotDir
      // (playwright.visual.config.ts: snapshotDir = "src/test/__screenshots__").
      await expect(screenshot).toMatchSnapshot(`${story.id}.png`, {
        maxDiffPixelRatio: TOLERANCE,
        threshold: 0.2,
      });
    });
  }
});
