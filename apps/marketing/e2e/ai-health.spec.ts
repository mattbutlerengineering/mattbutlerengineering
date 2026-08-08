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

test.describe("AI Health page", () => {
  test("renders Key Metrics, Sensor Status, and Queue Efficiency from a fresh report", async ({
    page,
  }) => {
    await mockSensorReport(page, "sensor-report-fresh", new Date().toISOString());
    await page.goto("/ai-health");

    await expect(page.getByRole("heading", { name: "AI Health Dashboard" })).toBeVisible();

    // Key Metrics
    await expect(page.getByRole("heading", { name: "Key Metrics" })).toBeVisible();
    await expect(page.getByText("CI Pass Rate")).toBeVisible();
    await expect(page.getByText("72%")).toBeVisible();
    await expect(page.getByText("PRs Merged (30d)")).toBeVisible();
    await expect(page.getByText("65")).toBeVisible();
    await expect(page.getByText("Issues Ready")).toBeVisible();
    await expect(page.getByText("27")).toBeVisible();

    // Queue Efficiency
    await expect(page.getByRole("heading", { name: "Queue Efficiency" })).toBeVisible();
    await expect(page.getByText("Composite Score")).toBeVisible();
    await expect(page.getByText("0.95")).toBeVisible();
    await expect(page.getByText("87.5%")).toBeVisible();
    await expect(page.getByText("$1.20")).toBeVisible();

    // Sensor Status
    await expect(page.getByRole("heading", { name: "Sensor Status" })).toBeVisible();
    const sensorStatusList = page.getByTestId("sensor-status-list");
    await expect(sensorStatusList.getByText("ciHealth")).toBeVisible();
    await expect(sensorStatusList.getByText("lighthouse")).toBeVisible();
    await expect(sensorStatusList.getByText("Unavailable")).toBeVisible();

    // No stale banner on a fresh report
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("shows the not-available state when the domainActivity sensor is absent", async ({
    page,
  }) => {
    // sensor-report-fresh has no `domainActivity` entry, so the panel must
    // fall back to its unavailable state rather than throwing or rendering
    // stale/placeholder counts.
    await mockSensorReport(page, "sensor-report-fresh", new Date().toISOString());
    await page.goto("/ai-health");

    await expect(page.getByRole("heading", { name: "Domain Activity" })).toBeVisible();

    const domainActivityPanel = page.getByTestId("domain-activity-panel");
    await expect(domainActivityPanel.getByText("domainActivity")).toBeVisible();
    await expect(domainActivityPanel.getByText("Unavailable")).toBeVisible();
    await expect(domainActivityPanel.getByTestId("reservations-created")).toHaveCount(0);
  });

  test("renders Domain Activity reservation and deposit counts from a populated fixture", async ({
    page,
  }) => {
    await mockSensorReport(page, "sensor-report-domain-activity", new Date().toISOString());
    await page.goto("/ai-health");

    await expect(page.getByRole("heading", { name: "Domain Activity" })).toBeVisible();

    const domainActivityPanel = page.getByTestId("domain-activity-panel");
    await expect(domainActivityPanel.getByTestId("reservations-created")).toHaveText("41");
    await expect(domainActivityPanel.getByTestId("reservations-cancelled")).toHaveText("6");
    await expect(domainActivityPanel.getByTestId("reservations-completed")).toHaveText("33");
    await expect(domainActivityPanel.getByTestId("reservations-no-show")).toHaveText("4");
    await expect(domainActivityPanel.getByTestId("deposits-held")).toHaveText("17");
    await expect(domainActivityPanel.getByTestId("deposits-applied")).toHaveText("13");
    await expect(domainActivityPanel.getByTestId("deposits-refunded")).toHaveText("5");
    await expect(domainActivityPanel.getByTestId("deposits-forfeited")).toHaveText("2");
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
