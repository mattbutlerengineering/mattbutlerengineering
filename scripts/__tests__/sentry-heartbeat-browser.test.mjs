import { describe, it, expect, vi } from "vitest";
import { triggerBrowserTarget, SENTRY_INGEST_HOST } from "../sentry-heartbeat.mjs";

const MARKER = "mbe-round-trip-20261001T000000000Z-abc";
const target = {
  id: "marketing",
  kind: "browser",
  project: "mattbutlerengineering",
  url: "https://example.test/",
  app: "marketing",
};

/** A fake Playwright chromium whose page behaviour each test can override. */
function fakeChromium({ goto, waitForRequest, consoleMessages = [] } = {}) {
  const listeners = {};
  const page = {
    on: vi.fn((event, handler) => {
      listeners[event] = handler;
    }),
    goto: vi.fn(
      goto ??
        (async () => {
          for (const message of consoleMessages) listeners.console?.(message);
        })
    ),
    waitForRequest: vi.fn(waitForRequest ?? (async () => ({}))),
    evaluate: vi.fn(async () => undefined),
  };
  const context = { newPage: vi.fn(async () => page) };
  const browser = {
    newContext: vi.fn(async () => context),
    close: vi.fn(async () => undefined),
  };
  const chromium = { launch: vi.fn(async () => browser) };
  return { chromium, browser, page };
}

describe("triggerBrowserTarget", () => {
  it("never bypasses the live CSP", async () => {
    const { chromium, browser } = fakeChromium();
    await triggerBrowserTarget(target, MARKER, { chromium });
    const launchOptions = chromium.launch.mock.calls[0][0] ?? {};
    const contextOptions = browser.newContext.mock.calls[0][0] ?? {};
    expect(launchOptions).not.toHaveProperty("bypassCSP");
    expect(contextOptions).not.toHaveProperty("bypassCSP");
  });

  it("loads the page, then throws the marker inside it after replaceState", async () => {
    const { chromium, page } = fakeChromium();
    const result = await triggerBrowserTarget(target, MARKER, { chromium });
    expect(result.triggered).toBe(true);
    expect(page.goto).toHaveBeenCalledWith(target.url, { waitUntil: "load", timeout: 30_000 });
    const [pageFunction, argument] = page.evaluate.mock.calls[0];
    expect(String(pageFunction)).toContain("replaceState");
    expect(String(pageFunction)).toContain("throw");
    expect(argument).toBe(MARKER);
  });

  it("is not triggered when navigation times out, and still closes the browser", async () => {
    const { chromium, browser, page } = fakeChromium({
      goto: async () => {
        throw new Error("page.goto: Timeout 30000ms exceeded.");
      },
    });
    const result = await triggerBrowserTarget(target, MARKER, { chromium });
    expect(result.triggered).toBe(false);
    expect(result.reason).toMatch(/Timeout/);
    expect(page.evaluate).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();
  });

  it("is still triggered when the envelope wait misses — the poll decides", async () => {
    const { chromium } = fakeChromium({
      waitForRequest: async () => {
        throw new Error("Timeout 15000ms exceeded");
      },
    });
    const result = await triggerBrowserTarget(target, MARKER, { chromium });
    expect(result).toMatchObject({ triggered: true, envelopeSeen: false });
  });

  it("waits only for requests to the Sentry ingest host", async () => {
    const { chromium, page } = fakeChromium();
    await triggerBrowserTarget(target, MARKER, { chromium });
    const [predicate, options] = page.waitForRequest.mock.calls[0];
    expect(options).toEqual({ timeout: 15_000 });
    expect(predicate({ url: () => `https://${SENTRY_INGEST_HOST}/api/1/x` })).toBe(true);
    expect(predicate({ url: () => "https://example.test/assets/app.js" })).toBe(false);
  });

  it("records console errors (where Chromium reports CSP refusals) as detail", async () => {
    const { chromium } = fakeChromium({
      consoleMessages: [
        {
          type: () => "error",
          text: () => "Refused to connect to 'https://x' because it violates CSP",
        },
        { type: () => "log", text: () => "hello" },
      ],
    });
    const result = await triggerBrowserTarget(target, MARKER, { chromium });
    expect(result.detail).toContain("Refused to connect");
    expect(result.detail).not.toContain("hello");
  });
});
