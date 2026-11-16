import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const demoRoutes = JSON.parse(
  readFileSync(new URL("./rialto-demo-routes.json", import.meta.url), "utf8")
) as { covered: { path: string; heading: string }[] };

const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://mattbutlerengineering.com";
const API_URL = process.env.SMOKE_API_URL ?? "https://api.mattbutlerengineering.com";

test.describe("Post-deploy smoke tests", () => {
  test.describe("Marketing site", () => {
    test("homepage loads", async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toBeVisible();
    });

    test("navigation links work", async ({ page }) => {
      await page.goto(`${BASE_URL}/`);
      // Check that global nav is present
      await expect(page.locator('nav[aria-label="Global navigation"]')).toBeVisible();
    });

    test("status page loads", async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/status`);
      expect(response?.status()).toBe(200);
      await expect(page.getByText("System Status")).toBeVisible();
    });
  });

  test.describe("API health", () => {
    test("users service healthy", async ({ request }) => {
      const response = await request.get(`${API_URL}/api/v1/users/health`);
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.status).not.toBe("error");
    });

    test("reservations service healthy", async ({ request }) => {
      const response = await request.get(`${API_URL}/api/v1/reservations/health`);
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.status).not.toBe("error");
    });

    test("agent service healthy", async ({ request }) => {
      const response = await request.get(`${API_URL}/api/gen/health`);
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.status).not.toBe("error");
    });
  });

  test.describe("Hospitality app", () => {
    test("loads login page", async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/hospitality`);
      expect(response?.status()).toBe(200);
    });
  });

  test.describe("Rialto app", () => {
    test("loads component library", async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/rialto`);
      expect(response?.status()).toBe(200);
    });
  });

  // rialto-web is an SPA: every path returns 200 and unknown routes are
  // redirected client-side to the overview, so assert the final pathname and
  // the rendered heading, not the status. The list is guarded against drift by
  // apps/rialto-web/src/routes.test.tsx. Read-only page loads; nothing is submitted.
  test.describe("Rialto demo routes", () => {
    for (const { path, heading } of demoRoutes.covered) {
      const demoPath = path === "" ? "/rialto/demos" : `/rialto/demos/${path}`;
      test(`demo ${demoPath} renders`, async ({ page }) => {
        const pageErrors: Error[] = [];
        page.on("pageerror", (error) => pageErrors.push(error));

        await page.goto(`${BASE_URL}${demoPath}`);

        await expect(page.locator("main")).toBeVisible();
        // attached, not visible: telemetry's h1 is screen-reader-only
        await expect(page.getByRole("heading", { name: heading }).first()).toBeAttached();
        expect(new URL(page.url()).pathname.replace(/\/$/, "")).toBe(demoPath);
        expect(pageErrors).toEqual([]);
      });
    }
  });
});
