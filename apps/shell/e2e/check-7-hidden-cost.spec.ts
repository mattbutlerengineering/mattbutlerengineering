import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import {
  hospitalityReady,
  metrics,
  navLink,
  prepare,
  report,
  rialtoReady,
  settle,
  trackStreams,
  type PrepareOptions,
} from "./support/harness.js";

// Spike record (30 s, desktop only): heap 13.3 MB in the host vs 8.2 + 3.6 standalone; 0 MB
// growth over 30 s; ~0.05 s CPU per 30 s; hidden hospitality kept 1 SSE open; 0 extra API
// requests. Tablet and hours-long cost are NOT covered here (breakdown Notes).
const SIT_MS = Number(process.env["HARNESS_SIT_MS"] ?? 30_000);
const MAX_HEAP_GROWTH_MB = 2;
const MAX_TASK_SECONDS = 1;
const EXPECTED_HIDDEN_STREAMS = 1;

async function sit(
  browser: Browser,
  testInfo: TestInfo,
  options: PrepareOptions,
  go: (page: Page) => Promise<void>
) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 600 } });
  const page = await context.newPage();
  await prepare(page, testInfo, options);
  let requestsDuringSit = 0;
  let counting = false;
  page.on("request", (r) => {
    if (counting && r.resourceType() !== "document" && !/\/events\/stream/.test(r.url())) {
      requestsDuringSit++;
    }
  });
  const streams = trackStreams(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await go(page);
  await settle(page);
  const start = await metrics(cdp);
  counting = true;
  await page.waitForTimeout(SIT_MS);
  counting = false;
  const end = await metrics(cdp);
  const result = {
    sitSeconds: SIT_MS / 1000,
    heapGrowthMB: Math.round(((end["heapUsedMB"] ?? 0) - (start["heapUsedMB"] ?? 0)) * 10) / 10,
    taskSeconds: Math.round(((end["taskSeconds"] ?? 0) - (start["taskSeconds"] ?? 0)) * 100) / 100,
    requestsDuringSit,
    streamsOpen: streams.open(),
  };
  await context.close();
  return result;
}

test("check 7: hidden hospitality costs no heap growth, no CPU and keeps one stream", async ({
  browser,
}, testInfo) => {
  const r = await sit(browser, testInfo, {}, async (page) => {
    await page.goto("/hospitality/timeline");
    await hospitalityReady(page);
    await navLink(page, "Design System");
    await rialtoReady(page);
  });
  report("check 7", "host, rialto-web visible, hospitality hidden", r);

  expect(r.heapGrowthMB, "heap growth while hidden (MB)").toBeLessThanOrEqual(MAX_HEAP_GROWTH_MB);
  expect(r.taskSeconds, "CPU seconds while hidden").toBeLessThanOrEqual(MAX_TASK_SECONDS);
  expect(r.requestsDuringSit, "requests while hidden").toBe(0);
  expect(r.streamsOpen, "SSE connections open while hidden").toBe(EXPECTED_HIDDEN_STREAMS);
});

test("check 7: hidden rialto-web costs no heap growth and no requests", async ({
  browser,
}, testInfo) => {
  const r = await sit(browser, testInfo, {}, async (page) => {
    await page.goto("/rialto/");
    await rialtoReady(page);
    await navLink(page, "Hospitality");
    await hospitalityReady(page);
  });
  report("check 7", "host, hospitality visible, rialto-web hidden", r);

  expect(r.heapGrowthMB, "heap growth while hidden (MB)").toBeLessThanOrEqual(MAX_HEAP_GROWTH_MB);
  expect(r.taskSeconds, "CPU seconds while hidden").toBeLessThanOrEqual(MAX_TASK_SECONDS);
});
