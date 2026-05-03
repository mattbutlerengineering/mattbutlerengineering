import { test, expect } from "@playwright/test";

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
      expect(body.status).toBe("ok");
    });

    test("reservations service healthy", async ({ request }) => {
      const response = await request.get(`${API_URL}/api/v1/reservations/health`);
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.status).toBe("ok");
    });

    test("agent service healthy", async ({ request }) => {
      const response = await request.get(`${API_URL}/api/gen/health`);
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.status).toBe("ok");
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
});
