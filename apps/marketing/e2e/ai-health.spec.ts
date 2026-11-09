import { readFileSync } from "fs";
import { join } from "path";
import { test, expect, type Page } from "@playwright/test";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf-8")) as Record<
    string,
    unknown
  >;
}

/**
 * Serves a fixture as the page's /sensor-report.json response, with
 * `generated_at` overridden to `generatedAt`. The fixture files pin a
 * realistic literal timestamp for schema documentation, but staleness is
 * evaluated relative to wall-clock "now" — overriding here keeps the test
 * deterministic regardless of when it runs, rather than the fixture's
 * committed date silently drifting stale (or "stale" drifting fresh).
 */
async function mockSensorReport(page: Page, fixtureName: string, generatedAt: string) {
  const fixture = loadFixture(fixtureName);
  const body = JSON.stringify({ ...fixture, generated_at: generatedAt });
  await page.route("**/sensor-report.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body })
  );
}

/**
 * Scopes a stat-value assertion to the Card containing `label`, instead of a
 * page-wide `getByText`. The header's "As of {date}" meta line renders the
 * current day-of-month as plain text, so a bare `page.getByText("<n>")` for
 * any stat value between 1 and 31 collides with that line's digits whenever
 * today's day-of-month happens to match (#4586). Each stat Card renders its
 * label and value as sibling Text nodes with no wrapper, so the label's
 * immediate parent element *is* the card.
 */
function statCard(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("..");
}

/** Persisted by Rialto's useThemeState (`THEME_STORAGE_KEY`). */
const THEME_STORAGE_KEY = "mbe-theme-preference";

const QUEUE_GAP_WIDTHS = [320, 375, 768, 1024, 1920] as const;

/**
 * Border-box edges for the Queue Efficiency stack and the two reference gaps
 * the distribution table should stay consistent with. Measured in the page so
 * a wrapping card row (narrow viewports) uses the grid's bottom, which is the
 * lowest card, not the first card's.
 */
async function measureQueueSpacing(page: Page) {
  return page.evaluate(() => {
    const byExactText = (text: string) =>
      [...document.querySelectorAll("p, span, h2")].find((el) => el.textContent === text);

    const composite = byExactText("Composite Score");
    const tier = byExactText("size:xs");
    const keyHeading = byExactText("Key Metrics");
    const queueHeading = byExactText("Queue Efficiency");
    const passRate = byExactText("CI Pass Rate");
    const chart = document.querySelector('[data-testid="queue-efficiency-trend"]');
    if (!composite || !tier || !keyHeading || !queueHeading || !passRate || !chart) {
      throw new Error("queue spacing landmarks missing");
    }

    const statGrid = composite.parentElement?.parentElement;
    const distribution = tier.parentElement?.parentElement;
    const keyCard = passRate.parentElement;
    const keyGrid = keyCard?.parentElement;
    if (!statGrid || !distribution || !keyGrid) {
      throw new Error("queue spacing containers missing");
    }
    if (!distribution.contains(tier) || distribution === statGrid) {
      throw new Error("size tier is not inside its own table");
    }

    const edge = (el: Element) => {
      const box = el.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    };
    const stats = edge(statGrid);
    const table = edge(distribution);
    const heading = edge(keyHeading);
    const cards = edge(keyGrid);
    const queue = edge(queueHeading);
    const trend = edge(chart);
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);

    return {
      distributionGap: table.top - stats.bottom,
      chartGap: trend.top - table.bottom,
      headingToCards: cards.top - heading.bottom,
      sectionGap: queue.top - cards.bottom,
      rootPx,
      theme: document.documentElement.getAttribute("data-theme"),
    };
  });
}

test.describe("AI Health page", () => {
  test("renders Key Metrics, Sensor Status, and Queue Efficiency from a fresh report", async ({
    page,
  }) => {
    await mockSensorReport(page, "sensor-report-fresh", new Date().toISOString());
    await page.goto("/ai-health");

    await expect(page.getByRole("heading", { name: "AI Health Dashboard" })).toBeVisible();

    // Key Metrics — each assertion is scoped to its stat card so it can
    // never collide with the "As of {date}" meta line's day-of-month digits.
    await expect(page.getByRole("heading", { name: "Key Metrics" })).toBeVisible();
    await expect(statCard(page, "CI Pass Rate").getByText("72%", { exact: true })).toBeVisible();
    await expect(statCard(page, "PRs Merged (30d)").getByText("65", { exact: true })).toBeVisible();
    await expect(statCard(page, "Issues Ready").getByText("27", { exact: true })).toBeVisible();

    // Queue Efficiency
    await expect(page.getByRole("heading", { name: "Queue Efficiency" })).toBeVisible();
    await expect(
      statCard(page, "Composite Score").getByText("0.95", { exact: true })
    ).toBeVisible();
    await expect(
      statCard(page, "First-Pass Success").getByText("87.5%", { exact: true })
    ).toBeVisible();
    await expect(statCard(page, "Cost / Issue").getByText("$1.20", { exact: true })).toBeVisible();

    // Sensor Status
    await expect(page.getByRole("heading", { name: "Sensor Status" })).toBeVisible();
    const sensorStatusList = page.getByTestId("sensor-status-list");
    await expect(sensorStatusList.getByText("ciHealth")).toBeVisible();
    await expect(sensorStatusList.getByText("lighthouse")).toBeVisible();
    await expect(sensorStatusList.getByText("Unavailable")).toBeVisible();

    // No stale banner on a fresh report
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("no longer renders a Domain Activity panel — the collector was retired (#5561)", async ({
    page,
  }) => {
    await mockSensorReport(page, "sensor-report-fresh", new Date().toISOString());
    await page.goto("/ai-health");

    await expect(page.getByRole("heading", { name: "Review Burden" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Domain Activity" })).toHaveCount(0);
    await expect(page.getByTestId("domain-activity-panel")).toHaveCount(0);
  });

  test("shows the stale-data banner when generated_at is more than 48h old", async ({ page }) => {
    const staleTimestamp = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    await mockSensorReport(page, "sensor-report-stale", staleTimestamp);
    await page.goto("/ai-health");

    await expect(page.getByRole("heading", { name: "AI Health Dashboard" })).toBeVisible();

    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Data may be out of date");

    // The rest of the page still renders behind the banner.
    await expect(page.getByRole("heading", { name: "Key Metrics" })).toBeVisible();
  });
});

test.describe("Queue Efficiency distribution spacing", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const width of QUEUE_GAP_WIDTHS) {
      test(`size table sits a component gap below the cards at ${width}px (${theme})`, async ({
        page,
      }) => {
        await page.addInitScript(
          ({ key, value }) => {
            localStorage.setItem(key, value);
          },
          { key: THEME_STORAGE_KEY, value: theme }
        );
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width, height: 900 });
        await mockSensorReport(page, "sensor-report-fresh", new Date().toISOString());
        await page.goto("/ai-health");

        await expect(page.getByRole("heading", { name: "Queue Efficiency" })).toBeVisible();
        await expect(page.getByText("size:xs", { exact: true })).toBeVisible();
        await expect(page.getByTestId("queue-efficiency-trend")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);

        const measured = await measureQueueSpacing(page);
        const where = `${width}px ${theme}: ${JSON.stringify(measured)}`;
        expect(measured.theme, where).toBe(theme);
        // 1.5rem sits between the 1rem heading gap and the 2.5rem section
        // gap — the ~24px the other blocks on this page already use. The
        // table previously contributed only its own border.
        expect(
          Math.abs(measured.distributionGap - measured.rootPx * 1.5),
          where
        ).toBeLessThanOrEqual(1);
        expect(Math.abs(measured.chartGap - measured.rootPx * 1.5), where).toBeLessThanOrEqual(1);
        expect(Math.abs(measured.headingToCards - measured.rootPx), where).toBeLessThanOrEqual(1);
        expect(Math.abs(measured.sectionGap - measured.rootPx * 2.5), where).toBeLessThanOrEqual(1);
      });
    }
  }
});
