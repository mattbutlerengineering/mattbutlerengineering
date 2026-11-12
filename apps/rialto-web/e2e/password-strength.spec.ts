import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "rialto-cookie-consent",
      JSON.stringify({
        consented: true,
        preferences: { essential: true, analytics: true, functional: true, marketing: true },
      })
    );
  });
});

test("password strength label and checklist render on one line each", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("demos/signup");
  await page.waitForLoadState("networkidle");

  const password = page.getByRole("textbox", { name: "Password", exact: true });
  await password.fill("abc");

  const weak = await measureStrength(page, "Too weak");
  expect(weak.labelFontPx).toBeCloseTo(weak.xsPx, 1);
  expect(weak.labelFontPx).toBeLessThan(14);
  expect(weak.labelColor).toBe(weak.errorColor);
  expect(weak.listStyle).toBe("none");
  expect(weak.rowDisplay).toBe("flex");
  expect(weak.rowDirection).toBe("row");
  expect(weak.rowAlign).toBe("center");
  expect(weak.rowHeight).toBeLessThan(28);
  expect(weak.svgInsideRow).toBe(true);
  expect(weak.labelBelowBar).toBe(true);

  await password.fill("Abcdefghijklmno1"); // gitleaks:allow — synthetic demo password fixture
  // Reduced motion collapses transitions to a hair above zero, so the
  // used color is still the previous red for a frame. Wait for it to settle.
  let strong = await measureStrength(page, "Very strong");
  await expect
    .poll(async () => {
      strong = await measureStrength(page, "Very strong");
      return strong.labelColor === strong.successColor;
    })
    .toBe(true);
  expect(strong.variant).toBe("success");
  expect(strong.rowHeight).toBeLessThan(28);
  expect(strong.svgInsideRow).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await measureStrength(page, "Very strong");
  expect(narrow.pageOverflow).toBeLessThanOrEqual(1);
  expect(narrow.rowHeight).toBeLessThan(28);
  expect(narrow.rowRight).toBeLessThanOrEqual((narrow.cardRight ?? 0) + 1);
});

function measureStrength(page: Page, labelText: string) {
  return page.evaluate((wanted) => {
    const label = [...document.querySelectorAll("span, p")].find((el) => el.textContent === wanted);
    const row = [...document.querySelectorAll("li")].find((el) =>
      (el.textContent ?? "").includes("At least 12 characters")
    );
    const list = row?.closest("ul") ?? null;
    const svg = row?.querySelector("svg") ?? null;
    const meter = document.querySelector("[role='meter']");
    const card = row?.closest("form")?.parentElement ?? null;
    const root = getComputedStyle(document.documentElement);
    const xs = root.getPropertyValue("--rialto-text-xs").trim();
    const xsPx = xs.endsWith("rem") ? parseFloat(xs) * 16 : parseFloat(xs);
    const toRgb = (hex: string) => {
      const value = hex.replace("#", "");
      const r = Number.parseInt(value.slice(0, 2), 16);
      const g = Number.parseInt(value.slice(2, 4), 16);
      const b = Number.parseInt(value.slice(4, 6), 16);
      return `rgb(${r}, ${g}, ${b})`;
    };
    const labelBox = label?.getBoundingClientRect();
    const rowBox = row?.getBoundingClientRect();
    const svgBox = svg?.getBoundingClientRect();
    const meterBox = meter?.getBoundingClientRect();
    const cardBox = card?.getBoundingClientRect();
    const labelStyle = label ? getComputedStyle(label) : null;
    const rowStyle = row ? getComputedStyle(row) : null;
    return {
      xsPx,
      labelFontPx: labelStyle ? parseFloat(labelStyle.fontSize) : null,
      labelColor: labelStyle?.color ?? null,
      errorColor: toRgb(root.getPropertyValue("--rialto-error").trim()),
      successColor: toRgb(root.getPropertyValue("--rialto-success").trim()),
      variant: label?.closest("[data-variant]")?.getAttribute("data-variant") ?? null,
      listStyle: list ? getComputedStyle(list).listStyleType : null,
      rowDisplay: rowStyle?.display ?? null,
      rowDirection: rowStyle?.flexDirection ?? null,
      rowAlign: rowStyle?.alignItems ?? null,
      rowHeight: rowBox?.height ?? null,
      svgInsideRow:
        !!rowBox && !!svgBox && svgBox.top >= rowBox.top - 1 && svgBox.bottom <= rowBox.bottom + 1,
      labelBelowBar: !!labelBox && !!meterBox && labelBox.top >= meterBox.top + meterBox.height - 1,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rowRight: rowBox?.right ?? null,
      cardRight: cardBox?.right ?? null,
    };
  }, labelText);
}
