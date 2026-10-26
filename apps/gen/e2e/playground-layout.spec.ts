import { test, expect } from "./fixtures.js";
import type { Locator, Page } from "@playwright/test";

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no bounding box");
  return b;
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function openPlayground(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByPlaceholder("Describe the UI you want to build...")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
}

test.describe("Playground layout (desktop)", () => {
  test("side panels fill their grid columns", async ({ authPage }) => {
    await openPlayground(authPage);
    const history = authPage.getByRole("complementary").filter({ hasText: "Favorites" });
    const inspector = authPage.getByRole("complementary").filter({ hasText: "JSON" });
    const prompt = authPage.getByRole("textbox", { name: "Prompt input" });

    const [h, i, p] = await Promise.all([box(history), box(inspector), box(prompt)]);
    // Both panels run down to the prompt bar, whose padding sits above the textbox.
    const reachesPromptBar = (b: Box) => p.y - (b.y + b.height);
    expect(h.x).toBe(0);
    expect(reachesPromptBar(h)).toBeGreaterThanOrEqual(0);
    expect(reachesPromptBar(h)).toBeLessThan(40);
    expect(i.x + i.width).toBeCloseTo(1440, 0);
    expect(reachesPromptBar(i)).toBeGreaterThanOrEqual(0);
    expect(reachesPromptBar(i)).toBeLessThan(40);
  });

  test("suggestion cards stay inside the preview column", async ({ authPage }) => {
    await openPlayground(authPage);
    const inspector = await box(authPage.getByRole("complementary").filter({ hasText: "JSON" }));
    const cards = authPage.getByRole("button", { name: /Dashboard|Landing Page|E-commerce/ });
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      const c = await box(card);
      expect(c.x + c.width).toBeLessThanOrEqual(inspector.x);
    }
  });

  test("inspector search does not cover its toolbar buttons", async ({ authPage }) => {
    await openPlayground(authPage);
    const search = await box(authPage.getByRole("textbox", { name: "Search JSON" }));
    const copy = await box(authPage.getByRole("button", { name: "Copy" }));
    expect(overlaps(search, copy)).toBe(false);
  });

  test("help button does not cover Generate", async ({ authPage }) => {
    await openPlayground(authPage);
    const help = await box(authPage.getByRole("button", { name: "Keyboard shortcuts" }));
    const generate = await box(authPage.getByRole("button", { name: "Generate" }));
    expect(overlaps(help, generate)).toBe(false);
  });

  test("brand mark sits on one line with its name", async ({ authPage }) => {
    await openPlayground(authPage);
    const logo = authPage.getByRole("button", { name: "Return to empty state" });
    const mark = await box(logo.getByText("◆"));
    const name = await box(logo.getByText("Gen Playground"));
    expect(mark.x + mark.width).toBeLessThanOrEqual(name.x);
    expect(Math.abs(mark.y + mark.height / 2 - (name.y + name.height / 2))).toBeLessThan(4);
  });
});
