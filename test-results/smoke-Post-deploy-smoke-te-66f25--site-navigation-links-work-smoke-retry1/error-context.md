# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> Post-deploy smoke tests >> Marketing site >> navigation links work
- Location: tests/smoke/smoke.spec.ts:16:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('nav')
Expected: visible
Error: strict mode violation: locator('nav') resolved to 2 elements:
    1) <nav class="_globalNav_esdag_3" aria-label="Global navigation">…</nav> aka getByRole('navigation', { name: 'Global navigation' })
    2) <nav aria-label="Footer links" class="_columns_1iryd_62">…</nav> aka getByRole('navigation', { name: 'Footer links' })

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('nav')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - link "Skip to main content" [ref=e5] [cursor=pointer]:
      - /url: "#main-content"
    - navigation "Global navigation" [ref=e6]:
      - generic [ref=e7]:
        - link "MBE" [ref=e8] [cursor=pointer]:
          - /url: /
        - list [ref=e9]:
          - listitem [ref=e10]:
            - link "Home" [ref=e11] [cursor=pointer]:
              - /url: /
          - listitem [ref=e12]:
            - link "Hospitality" [ref=e13] [cursor=pointer]:
              - /url: /hospitality
          - listitem [ref=e14]:
            - link "Design System" [ref=e15] [cursor=pointer]:
              - /url: /rialto
        - button "Switch to dark mode" [ref=e17] [cursor=pointer]:
          - img [ref=e18]
    - main [active] [ref=e20]
    - contentinfo [ref=e21]:
      - generic [ref=e22]: MBE
      - navigation "Footer links" [ref=e23]:
        - generic [ref=e24]:
          - generic [ref=e25]: Projects
          - list [ref=e26]:
            - listitem [ref=e27]:
              - link "Rialto Design System" [ref=e28] [cursor=pointer]:
                - /url: /rialto
            - listitem [ref=e29]:
              - link "Hospitality Platform" [ref=e30] [cursor=pointer]:
                - /url: /hospitality
        - generic [ref=e31]:
          - generic [ref=e32]: Connect
          - list [ref=e33]:
            - listitem [ref=e34]:
              - link "GitHub" [ref=e35] [cursor=pointer]:
                - /url: https://github.com/mattbutlerengineering
            - listitem [ref=e36]:
              - link "LinkedIn" [ref=e37] [cursor=pointer]:
                - /url: https://www.linkedin.com/in/matt-butler-66496a68/
            - listitem [ref=e38]:
              - link "Email" [ref=e39] [cursor=pointer]:
                - /url: mailto:mattbutlerengineering+webapp@gmail.com
      - paragraph [ref=e40]: © 2026 Matt Butler Engineering
  - region "Notifications"
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
> 19 |       await expect(page.locator("nav")).toBeVisible();
     |                                         ^ Error: expect(locator).toBeVisible() failed
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
  50 |       expect(response.ok()).toBe(true);
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