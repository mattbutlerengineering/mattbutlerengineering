import { test, expect, type Page } from "@playwright/test";
import { SEL, hospitalityReady, navLink, prepare, report, rialtoReady } from "./support/harness.js";

// Spike record: with a raw shared window the hidden app's DOM emptied (316 to 4 nodes) and the
// router threw "basename not able to match"; with the scoped window it kept 316 nodes, 0 console
// errors, and the W6 walk landed right.
const nodes = (page: Page, sel: string) =>
  page.evaluate((s) => document.querySelector(s)?.querySelectorAll("*").length ?? 0, sel);

const path = (page: Page) => new URL(page.url()).pathname;

function collectConsoleProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(m.text().slice(0, 160));
  });
  return problems;
}

test("check 4: a hidden app's DOM is not emptied by the visible app's navigation", async ({
  page,
}, testInfo) => {
  await prepare(page, testInfo);
  const problems = collectConsoleProblems(page);
  await page.goto("/hospitality/timeline");
  await hospitalityReady(page);
  const before = await nodes(page, SEL.hospitality);
  await navLink(page, "Design System");
  await rialtoReady(page);
  await page
    .getByRole("link", { name: /^Button$/ })
    .first()
    .click();
  await page.waitForTimeout(800);
  const hiddenAfterMove = await nodes(page, SEL.hospitality);
  await page.goBack();
  await page.waitForTimeout(800);
  const hiddenAfterBack = await nodes(page, SEL.hospitality);
  report("check 4", "hospitality hidden-tree nodes", {
    before,
    hiddenAfterMove,
    hiddenAfterBack,
    consoleProblems: [...new Set(problems)],
  });

  expect(before, "hospitality rendered").toBeGreaterThan(50);
  expect(hiddenAfterMove, "not emptied by a visible-app move").toBe(before);
  expect(hiddenAfterBack, "not emptied by Back").toBe(before);
  expect([...new Set(problems)], "no console errors or warnings").toEqual([]);
});

test("check 4: interleaved history walk lands on the right app and page", async ({
  page,
}, testInfo) => {
  await prepare(page, testInfo);
  const problems = collectConsoleProblems(page);
  await page.goto("/hospitality/timeline");
  await hospitalityReady(page);
  await page.getByRole("button", { name: "Guests", exact: true }).first().click();
  await expect.poll(() => path(page)).toContain("/hospitality/guests");
  const guests = path(page);
  await navLink(page, "Design System");
  await rialtoReady(page);
  const rialtoRoot = path(page);
  await page
    .getByRole("link", { name: /^Button$/ })
    .first()
    .click();
  await expect.poll(() => path(page)).toContain("/rialto/components/button");

  const steps: Array<{ step: string; url: string }> = [];
  for (const [step, go] of [
    ["Back 1", () => page.goBack()],
    ["Back 2", () => page.goBack()],
    ["Forward 1", () => page.goForward()],
  ] as const) {
    await go();
    await page.waitForTimeout(1000);
    steps.push({ step, url: path(page) });
  }
  report("check 4", "walk", { guests, rialtoRoot, steps });

  expect(steps[0]?.url, "Back 1: the design system's first page").toBe(rialtoRoot);
  expect(steps[1]?.url, "Back 2 crosses to hospitality guests").toBe(guests);
  expect(steps[2]?.url, "Forward 1 crosses to the design system").toBe(rialtoRoot);
  expect([...new Set(problems)], "no console errors or warnings").toEqual([]);
});

test("check 4: a named deep link into a kept-alive app lands on that page", async ({
  page,
}, testInfo) => {
  await prepare(page, testInfo);
  await page.goto("/rialto/");
  await rialtoReady(page);
  await navLink(page, "Hospitality");
  await hospitalityReady(page);
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = "/rialto/components/button";
    a.textContent = "deep";
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
  await expect.poll(() => path(page)).toBe("/rialto/components/button");
  await expect(page.locator(SEL.rialto).locator("h1").first()).toContainText(/button/i);
});
