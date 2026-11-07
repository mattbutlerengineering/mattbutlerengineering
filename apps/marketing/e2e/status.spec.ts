import { test, expect, type Page } from "@playwright/test";

/** Same shape as a deployed service version: a 40-char git sha. */
const LONG_VERSION = "77f84aca5c5c2c53b92df10b9a3390abcdef12";
const SHORT_VERSION = "1.0.0";

/** Persisted by Rialto's useThemeState (`THEME_STORAGE_KEY`). */
const THEME_STORAGE_KEY = "mbe-theme-preference";

const SERVICE_NAMES = ["Users API", "Reservations API", "Agent API"] as const;

const WIDTHS = [
  { label: "desktop", width: 1920, height: 1080 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "mobile", width: 375, height: 812 },
  { label: "narrow", width: 320, height: 700 },
] as const;

/**
 * Answers the three /status health probes. Static-site HEAD checks hit the
 * preview server itself and are left alone.
 */
async function mockServiceHealth(page: Page, version: string) {
  await page.route("**/api/**/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", version }),
    })
  );
}

async function openStatus(page: Page, theme: "light" | "dark", width: number, height: number) {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: THEME_STORAGE_KEY, value: theme }
  );
  await page.emulateMedia({ colorScheme: theme });
  await page.setViewportSize({ width, height });
  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Cards whose version (or name) paints past the card border. An inline hash
 * keeps a layout box wider than the card; ancestor overflow clips the paint,
 * so this uses the rect after that clipping. A clip without an ellipsis
 * fails too. The full hash stays in the text and the title.
 */
async function cardOverflowProblems(page: Page): Promise<string[]> {
  return page.evaluate(
    (names) => {
      const problems: string[] = [];
      const viewport = document.documentElement.clientWidth;
      const slack = 1;

      function clippedRect(el: Element): DOMRect {
        const box = el.getBoundingClientRect();
        let { left, right, top, bottom } = box;
        let node = el.parentElement;
        while (node) {
          const style = getComputedStyle(node);
          const clipsX = style.overflowX === "hidden" || style.overflowX === "clip";
          const clipsY = style.overflowY === "hidden" || style.overflowY === "clip";
          if (clipsX || clipsY) {
            const bound = node.getBoundingClientRect();
            if (clipsX) {
              left = Math.max(left, bound.left);
              right = Math.min(right, bound.right);
            }
            if (clipsY) {
              top = Math.max(top, bound.top);
              bottom = Math.min(bottom, bound.bottom);
            }
          }
          node = node.parentElement;
        }
        return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
      }

      for (const name of names) {
        const label = [...document.querySelectorAll("#main-content *")].find(
          (el) => el.childNodes.length === 1 && el.textContent === name
        );
        const card = label?.parentElement?.parentElement;
        const version = card?.querySelector("code");
        if (!label || !card || !version) {
          problems.push(`${name}: could not find the service card`);
          continue;
        }
        const cardRect = card.getBoundingClientRect();
        const versionRect = version.getBoundingClientRect();
        const visible = clippedRect(version);
        const nameRect = label.getBoundingClientRect();
        if (visible.right > cardRect.right + slack || visible.left < cardRect.left - slack) {
          problems.push(
            `${name}: version (${Math.round(visible.left)}–${Math.round(visible.right)}) escapes card (${Math.round(cardRect.left)}–${Math.round(cardRect.right)})`
          );
        }
        if (nameRect.right > cardRect.right + slack || nameRect.left < cardRect.left - slack) {
          problems.push(
            `${name}: name (${Math.round(nameRect.left)}–${Math.round(nameRect.right)}) escapes card (${Math.round(cardRect.left)}–${Math.round(cardRect.right)})`
          );
        }
        if (cardRect.right > viewport + slack) {
          problems.push(`${name}: card right ${Math.round(cardRect.right)} > viewport ${viewport}`);
        }
        const paintsPastCard = versionRect.right > cardRect.right + slack;
        if (paintsPastCard) {
          let ellipsis = false;
          let node: Element | null = version;
          while (node) {
            if (getComputedStyle(node).textOverflow === "ellipsis") ellipsis = true;
            node = node.parentElement;
          }
          if (!ellipsis) problems.push(`${name}: hash is clipped without an ellipsis`);
        }
        if ((version.textContent ?? "") !== (version.getAttribute("title") ?? "")) {
          problems.push(`${name}: title does not match the full version text`);
        }
      }
      return problems;
    },
    [...SERVICE_NAMES]
  );
}

test.describe("Status page", () => {
  test("loads with System Status heading", async ({ page }) => {
    await page.goto("/status");

    await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
  });

  test("shows API Services section with expected services", async ({ page }) => {
    await page.goto("/status");

    await expect(page.getByRole("heading", { name: "API Services" })).toBeVisible();
    await expect(page.getByText("Users API")).toBeVisible();
    await expect(page.getByText("Reservations API")).toBeVisible();
    await expect(page.getByText("Agent API")).toBeVisible();
  });

  test("shows Static Sites section with expected sites", async ({ page }) => {
    await page.goto("/status");

    await expect(page.getByRole("heading", { name: "Static Sites" })).toBeVisible();
    // Scoped to #main-content: "Hospitality" also appears in nav/footer links
    // outside main, which collide with an unscoped getByText in strict mode.
    const main = page.locator("#main-content");
    await expect(main.getByText("Marketing", { exact: true })).toBeVisible();
    await expect(main.getByText("Hospitality", { exact: true })).toBeVisible();
    await expect(main.getByText("Rialto", { exact: true })).toBeVisible();
  });

  test("shows overall status badge on load", async ({ page }) => {
    await page.goto("/status");

    // Badge shows either Checking... (loading) or a resolved state
    const badge = page.locator('[class*="badge"]').first();
    await expect(badge).toBeVisible();
  });

  test("degrades gracefully when the health probes fail", async ({ page }) => {
    // A deploy with no backend (preview server, ui-quality capture) answers the
    // probes with 502; the page must report the outage, not throw.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await page.route("**/api/**/health", (route) => route.fulfill({ status: 502, body: "" }));

    await page.goto("/status");

    await expect(page.locator("#main-content").getByText("Last checked")).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});

for (const theme of ["light", "dark"] as const) {
  test.describe(`API service cards contain the version hash (${theme})`, () => {
    for (const viewport of WIDTHS) {
      test(`at ${viewport.label} (${viewport.width}px)`, async ({ page }) => {
        await mockServiceHealth(page, LONG_VERSION);
        await openStatus(page, theme, viewport.width, viewport.height);
        const main = page.locator("#main-content");
        const hash = main.locator("code", { hasText: `v${LONG_VERSION}` });
        await expect(hash).toHaveCount(3);

        const problems = await cardOverflowProblems(page);
        expect(problems, problems.join("\n")).toEqual([]);
        await expect(hash.first()).toHaveAttribute("title", `v${LONG_VERSION}`);
      });
    }
  });
}

test("short versions stay fully visible inside the card", async ({ page }) => {
  await mockServiceHealth(page, SHORT_VERSION);
  await openStatus(page, "light", 320, 700);
  const main = page.locator("#main-content");
  const hash = main.locator("code", { hasText: `v${SHORT_VERSION}` });
  await expect(hash).toHaveCount(3);
  const clipped = await hash.evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const line = node.parentElement;
        return line !== null && line.scrollWidth > line.clientWidth + 1;
      })
      .map((node) => node.textContent ?? "")
  );
  expect(clipped, "short hashes must not ellipsize at 320px").toEqual([]);
  expect(await cardOverflowProblems(page)).toEqual([]);
});
