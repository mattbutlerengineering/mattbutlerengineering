import { test, expect, type Page } from "@playwright/test";

/** Persisted by Rialto's useThemeState (`THEME_STORAGE_KEY`). */
const THEME_STORAGE_KEY = "mbe-theme-preference";

/** Subpixel rounding. A real overflow is tens of pixels. */
const EDGE_SLACK_PX = 1;

/**
 * 320 is the reported clip (scrollWidth 345). 375 and 1280 are the visual
 * baselines, which must keep today's type size. 768 is the tablet column break.
 */
const VIEWPORTS = [
  { label: "narrow", width: 320, height: 640 },
  { label: "mobile", width: 375, height: 812 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "desktop", width: 1280, height: 720 },
] as const;

const THEMES = ["light", "dark"] as const;

/** The two live stories the clip was reported on. They share this template. */
const STORIES = ["/shipped/public-demo-venue-9509", "/shipped/the-invitation-8670"] as const;

interface StoryLayout {
  clientWidth: number;
  scrollWidth: number;
  fontFamily: string;
  heading: { textWidth: number; clientWidth: number; right: number } | null;
  offenders: string[];
}

async function openStory(
  page: Page,
  path: string,
  theme: "light" | "dark",
  width: number,
  height: number
) {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: THEME_STORAGE_KEY, value: theme }
  );
  await page.emulateMedia({ colorScheme: theme });
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Decomposition", level: 2 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => document.fonts.load('400 48px "Bricolage Grotesque"'));
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

async function measureStory(page: Page): Promise<StoryLayout> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const clientWidth = root.clientWidth;
    const scrollWidth = root.scrollWidth;
    const heading = [...document.querySelectorAll("h2")].find(
      (el) => el.textContent?.trim() === "Decomposition"
    );
    let measured: StoryLayout["heading"] = null;
    if (heading instanceof HTMLElement) {
      const range = document.createRange();
      range.selectNodeContents(heading);
      const text = range.getBoundingClientRect();
      measured = {
        textWidth: text.width,
        clientWidth: heading.clientWidth,
        right: text.right,
      };
    }
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > clientWidth + 1) {
        const cls =
          typeof el.className === "string" && el.className.trim()
            ? `.${el.className.trim().split(/\s+/).join(".")}`
            : "";
        offenders.push(
          `${el.tagName.toLowerCase()}${cls} right=${Math.round(rect.right)} width=${Math.round(rect.width)}`
        );
      }
    }
    return {
      clientWidth,
      scrollWidth,
      fontFamily: heading instanceof HTMLElement ? getComputedStyle(heading).fontFamily : "",
      heading: measured,
      offenders: offenders.slice(0, 12),
    };
  });
}

for (const story of STORIES) {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`${story} stays inside a ${viewport.label} ${theme} viewport`, async ({ page }) => {
        await openStory(page, story, theme, viewport.width, viewport.height);
        const layout = await measureStory(page);

        expect(
          layout.fontFamily,
          "measure the display face; a fallback sans hides the overflow"
        ).toMatch(/Bricolage Grotesque/);

        expect(
          layout.scrollWidth,
          `page is ${layout.scrollWidth}px wide in a ${layout.clientWidth}px viewport; overhang:\n  ${layout.offenders.join("\n  ")}`
        ).toBeLessThanOrEqual(layout.clientWidth + EDGE_SLACK_PX);
        expect(layout.offenders, `elements overhang the ${layout.clientWidth}px viewport`).toEqual(
          []
        );

        expect(layout.heading, "Decomposition heading is missing").not.toBeNull();
        const heading = layout.heading;
        if (heading === null) return;
        expect(
          heading.right,
          `"Decomposition" ends at ${Math.round(heading.right)}px in a ${layout.clientWidth}px viewport (glyphs ${Math.round(heading.textWidth)}px, box ${heading.clientWidth}px)`
        ).toBeLessThanOrEqual(layout.clientWidth + EDGE_SLACK_PX);
        // The reported clip is the glyphs wider than the heading box, which
        // the viewport then cuts to "Decompositic". 375px already contains
        // the word, so only the narrow viewport requires the box itself to
        // hold every glyph (a shrink or a wrap, never a clip).
        if (viewport.width <= 320) {
          expect(heading.textWidth).toBeLessThanOrEqual(heading.clientWidth + EDGE_SLACK_PX);
        }
      });
    }
  }
}

/**
 * Stories whose proposal text, issue titles or PR titles hold long unbroken
 * tokens (paths, backticked JSON, identifiers). Measured overhang at 375px
 * before the fix: 736, 665, 511 (#9978).
 */
const LONG_TOKEN_STORIES = [
  "/shipped/marketing-ai-health-page-pr-category-breakdown-5904",
  "/shipped/rialto-web-phase-5-domain-example-pages-5210",
  "/shipped/dress-rehearsal-7377",
  "/shipped/widen-mutation-pilot-to-services-reservations-9599",
  "/shipped/guest-change-booking-6928",
  "/shipped/hospitality-deposit-exposure-dashboard-5837",
  "/shipped/rialto-catalog-widening-9524",
  "/shipped/queue-telemetry-freshness-5925",
  "/shipped/gen-point-and-refine-6935",
  "/shipped/reservation-event-log-6942",
  "/shipped/gen-template-gallery-widening-4427",
  "/shipped/gen-template-batch-6-5843",
] as const;

for (const story of LONG_TOKEN_STORIES) {
  test(`${story} wraps long tokens inside a 375px viewport`, async ({ page }) => {
    await openStory(page, story, "light", 375, 812);
    const { scrollWidth, clientWidth } = await measureStory(page);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + EDGE_SLACK_PX);
    // Long-token wrapping must stay off headings: "Decomposition" is one word
    // and must render on a single line, never "Decompositio|n".
    const lines = await page.evaluate(() => {
      const h2 = [...document.querySelectorAll("h2")].find(
        (el) => el.textContent?.trim() === "Decomposition"
      );
      if (!h2) return 0;
      const range = document.createRange();
      range.selectNodeContents(h2);
      return range.getClientRects().length;
    });
    expect(lines, "Decomposition heading must not break mid-word").toBe(1);
  });
}
