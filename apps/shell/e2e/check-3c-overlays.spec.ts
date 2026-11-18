import { test, expect } from "@playwright/test";
import { SEL, hospitalityReady, navLink, prepare, report, rialtoReady } from "./support/harness.js";

// Spike record: an open dialog stayed inside its app container at 0x0 while hidden.
test("check 3c: an open overlay of a hidden app stays in its container and takes no space", async ({
  page,
}, testInfo) => {
  await prepare(page, testInfo);
  await page.goto("/hospitality/timeline");
  await hospitalityReady(page);
  await page
    .getByRole("button", { name: /palette|search|command/i })
    .first()
    .click();
  await expect(page.getByRole("dialog").first(), "dialog opens").toBeVisible();

  await navLink(page, "Design System");
  await rialtoReady(page);

  const after = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const r = d?.getBoundingClientRect();
    return {
      dialogInDom: !!d,
      insideAppContainer: !!d?.closest("[data-app]"),
      width: r ? Math.round(r.width) : null,
      height: r ? Math.round(r.height) : null,
    };
  });
  report("check 3c", "dialog after crossing", after);

  expect(after.dialogInDom, "the dialog is kept").toBe(true);
  expect(after.insideAppContainer, "it stays inside its app container").toBe(true);
  expect([after.width, after.height], "hidden, it has no rect").toEqual([0, 0]);
  await expect(page.locator(SEL.rialto).locator("main").first()).toBeVisible();
});
