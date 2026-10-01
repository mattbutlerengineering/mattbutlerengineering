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
function fakeChromium({ goto, waitForResponse, consoleMessages = [], cspViolations = [] } = {}) {
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
    waitForResponse: vi.fn(waitForResponse ?? (async () => ({ status: () => 200 }))),
    addInitScript: vi.fn(async () => undefined),
    // first evaluate throws the heartbeat; the second reads recorded CSP violations
    evaluate: vi.fn(async (_fn, argument) => (argument === undefined ? cspViolations : undefined)),
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
      waitForResponse: async () => {
        throw new Error("Timeout 15000ms exceeded");
      },
    });
    const result = await triggerBrowserTarget(target, MARKER, { chromium });
    expect(result).toMatchObject({ triggered: true, envelopeSeen: false });
  });

  it("waits for the envelope RESPONSE before closing — closing on the request aborts the POST", async () => {
    // Measured 2026-10-01: waiting only for the request to start, then closing
    // the browser, saw the envelope request yet no event ever reached Sentry.
    const order = [];
    const { chromium, browser } = fakeChromium({
      waitForResponse: async () => {
        order.push("response");
        return { status: () => 200 };
      },
    });
    browser.close.mockImplementation(async () => {
      order.push("close");
    });
    const result = await triggerBrowserTarget(target, MARKER, { chromium });
    expect(order).toEqual(["response", "close"]);
    expect(result).toMatchObject({ envelopeSeen: true, envelopeStatus: 200 });
  });

  it("waits only for responses from the Sentry ingest host", async () => {
    const { chromium, page } = fakeChromium();
    await triggerBrowserTarget(target, MARKER, { chromium });
    const [predicate, options] = page.waitForResponse.mock.calls[0];
    expect(options).toEqual({ timeout: 15_000 });
    const response = (url, body) => ({ url: () => url, request: () => ({ postData: () => body }) });
    expect(predicate(response(`https://${SENTRY_INGEST_HOST}/api/1/x`, `{"m":"${MARKER}"}`))).toBe(
      true
    );
    expect(predicate(response("https://example.test/assets/app.js", MARKER))).toBe(false);
  });

  it("does not stop waiting on the SDK's session envelope — only the one carrying the marker", async () => {
    // @sentry/core sends the session update BEFORE the error event
    // (client.js _processEvent), so the first ingest response on a throw is
    // usually the session; closing on it can abort the error POST.
    const { chromium, page } = fakeChromium();
    await triggerBrowserTarget(target, MARKER, { chromium });
    const [predicate] = page.waitForResponse.mock.calls[0];
    const ingest = `https://${SENTRY_INGEST_HOST}/api/1/envelope/`;
    const session = {
      url: () => ingest,
      request: () => ({ postData: () => '{"type":"session"}' }),
    };
    const noBody = { url: () => ingest, request: () => ({ postData: () => null }) };
    expect(predicate(session)).toBe(false);
    expect(predicate(noBody)).toBe(false);
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

  it("records securitypolicyviolation events the page saw as detail", async () => {
    const { chromium, page } = fakeChromium({
      cspViolations: ["script-src blocked eval from https://example.test/assets/vendor.js"],
    });
    const result = await triggerBrowserTarget(target, MARKER, { chromium });
    expect(page.addInitScript).toHaveBeenCalled();
    expect(result.detail).toContain("CSP violation: script-src blocked eval");
  });
});
