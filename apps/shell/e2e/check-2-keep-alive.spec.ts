import { test, expect } from "@playwright/test";
import {
  SEL,
  chatToken,
  hospitalityReady,
  navLink,
  openChatAndSend,
  prepare,
  report,
  rialtoReady,
  scrollScrollables,
  scrollSnapshot,
} from "./support/harness.js";

const HIDDEN_SIT_MS = 5000;

// Spike record: token 3 at leave, 42 on return, same main node, scroll identical, no chat
// client abort with display:none. Open record is asserted here; the spike only inferred it.
test("check 2: chat, open record and scroll survive leave and return", async ({
  page,
}, testInfo) => {
  await prepare(page, testInfo);
  await page.goto("/hospitality/timeline");
  await hospitalityReady(page);

  const block = page.getByTestId("reservation-block-res_e2e_001");
  await expect(block, "fixture reservation is on the timeline").toBeVisible();
  await block.click();
  const detail = page.getByTestId("reservation-detail-sidebar");
  await expect(detail, "record opens").toBeVisible();
  await scrollScrollables(page, SEL.hospitality, 120);
  await openChatAndSend(page);

  const scrollBefore = await scrollSnapshot(page, SEL.hospitality);
  const tokenAtLeave = await chatToken(page);
  const urlLeft = page.url();
  await page.evaluate((sel) => {
    (window as unknown as Record<string, unknown>)["__hospMain"] = document.querySelector(
      `${sel} main`
    );
  }, SEL.hospitality);

  await navLink(page, "Design System");
  await rialtoReady(page);
  await page.waitForTimeout(HIDDEN_SIT_MS);
  await navLink(page, "Hospitality");
  await expect(page.locator(`${SEL.chat} textarea`).first()).toBeVisible();

  const tokenOnReturn = await chatToken(page);
  const scrollAfter = await scrollSnapshot(page, SEL.hospitality);
  const result = await page.evaluate((sel) => {
    const w = window as unknown as Record<string, unknown>;
    return {
      mainSameNode: w["__hospMain"] === document.querySelector(`${sel} main`),
      chatClientAborts: (w["__chatAborts"] as number | undefined) ?? 0,
    };
  }, SEL.hospitality);
  report("check 2", "return via nav", {
    tokenAtLeave,
    tokenOnReturn,
    urlIsLastLocation: page.url() === urlLeft,
    scrollBefore,
    scrollAfter,
    ...result,
  });

  expect(tokenAtLeave, "chat was streaming at leave").not.toBeNull();
  expect(tokenOnReturn ?? 0, "chat kept streaming while hidden").toBeGreaterThan(tokenAtLeave ?? 0);
  expect(result.chatClientAborts, "chat stream was not aborted").toBe(0);
  expect(result.mainSameNode, "same main node").toBe(true);
  expect(page.url(), "returns to the last location").toBe(urlLeft);
  expect(scrollAfter, "scroll is identical").toEqual(scrollBefore);
  await expect(detail, "open record survives").toBeVisible();
});

test("check 2: signed-out gate survives a crossing", async ({ page }, testInfo) => {
  await prepare(page, testInfo, { signedIn: false });
  await page.goto("/hospitality/");
  const signIn = page.getByRole("button", { name: /sign in/i }).first();
  await expect(signIn).toBeVisible({ timeout: 30_000 });
  await navLink(page, "Design System");
  await rialtoReady(page);
  await navLink(page, "Hospitality");
  await expect(signIn, "gate after return").toBeVisible();
});
