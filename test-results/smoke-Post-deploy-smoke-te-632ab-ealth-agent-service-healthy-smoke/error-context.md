# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> Post-deploy smoke tests >> API health >> agent service healthy
- Location: tests/smoke/smoke.spec.ts:48:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | const BASE_URL =
  4  |   process.env.SMOKE_BASE_URL ?? "https://mattbutlerengineering.com";
  5  | const API_URL =
  6  |   process.env.SMOKE_API_URL ?? "https://api.mattbutlerengineering.com";
  7  | 
  8  | test.describe("Post-deploy smoke tests", () => {
  9  |   test.describe("Marketing site", () => {
  10 |     test("homepage loads", async ({ page }) => {
  11 |       const response = await page.goto(`${BASE_URL}/`);
  12 |       expect(response?.status()).toBe(200);
  13 |       await expect(page.locator("main")).toBeVisible();
  14 |     });
  15 | 
  16 |     test("navigation links work", async ({ page }) => {
  17 |       await page.goto(`${BASE_URL}/`);
  18 |       // Check that global nav is present
  19 |       await expect(page.locator("nav")).toBeVisible();
  20 |     });
  21 | 
  22 |     test("status page loads", async ({ page }) => {
  23 |       const response = await page.goto(`${BASE_URL}/status`);
  24 |       expect(response?.status()).toBe(200);
  25 |       await expect(page.getByText("System Status")).toBeVisible();
  26 |     });
  27 |   });
  28 | 
  29 |   test.describe("API health", () => {
  30 |     test("users service healthy", async ({ request }) => {
  31 |       const response = await request.get(
  32 |         `${API_URL}/api/v1/users/health`
  33 |       );
  34 |       expect(response.ok()).toBe(true);
  35 |       const body = await response.json();
  36 |       expect(body.status).toBe("ok");
  37 |     });
  38 | 
  39 |     test("reservations service healthy", async ({ request }) => {
  40 |       const response = await request.get(
  41 |         `${API_URL}/api/v1/reservations/health`
  42 |       );
  43 |       expect(response.ok()).toBe(true);
  44 |       const body = await response.json();
  45 |       expect(body.status).toBe("ok");
  46 |     });
  47 | 
  48 |     test("agent service healthy", async ({ request }) => {
  49 |       const response = await request.get(`${API_URL}/v1/sessions`);
> 50 |       expect(response.ok()).toBe(true);
     |                             ^ Error: expect(received).toBe(expected) // Object.is equality
  51 |     });
  52 |   });
  53 | 
  54 |   test.describe("Hospitality app", () => {
  55 |     test("loads login page", async ({ page }) => {
  56 |       const response = await page.goto(`${BASE_URL}/hospitality`);
  57 |       expect(response?.status()).toBe(200);
  58 |     });
  59 |   });
  60 | 
  61 |   test.describe("Rialto app", () => {
  62 |     test("loads component library", async ({ page }) => {
  63 |       const response = await page.goto(`${BASE_URL}/rialto`);
  64 |       expect(response?.status()).toBe(200);
  65 |     });
  66 |   });
  67 | });
  68 | 
```