import { describe, it, expect } from "vitest";
import type { Page } from "@playwright/test";
import { createJourneyRecorder } from "./journey-recorder.js";

// Unit tests for the recorder's failure-path capture. Run by vitest, not
// Playwright: the PR-time config testIgnores the whole journeys directory and
// the journey config only matches *.spec.ts, so this file is in neither suite.

interface FakeLocator {
  count: () => Promise<number>;
  innerText: () => Promise<string>;
}

/** Minimal Page stand-in — only the members the recorder actually touches. */
function createFakePage(locator: () => FakeLocator) {
  const screenshots: string[] = [];
  const page = {
    on: () => page,
    // The recorder narrows with `.first()`; an unnarrowed multi-match locator
    // would throw a strict-mode violation on innerText against a real page.
    locator: () => ({ first: locator }),
    screenshot: ({ path }: { path: string }) => {
      screenshots.push(path);
      return Promise.resolve();
    },
  };
  return { page: page as unknown as Page, screenshots };
}

/** A locator matching one visible alert with the given text. */
function alertWith(text: string): () => FakeLocator {
  return () => ({ count: () => Promise.resolve(1), innerText: () => Promise.resolve(text) });
}

/** A locator matching nothing — the page had no visible alert. */
const noAlert = (): FakeLocator => ({
  count: () => Promise.resolve(0),
  innerText: () => Promise.reject(new Error("should not be called")),
});

const BOOM = new Error("locator.click: Timeout 15000ms exceeded");

describe("createJourneyRecorder page-error capture", () => {
  it("records the visible alert text alongside the failure", async () => {
    const { page } = createFakePage(
      alertWith("POST /api/v1/venues failed: 403 Admin role required")
    );
    const journey = createJourneyRecorder(page, "synthetic-journey-1");

    await journey.step("Launch venue", () => Promise.reject(BOOM));

    expect(journey.report().steps[0]).toMatchObject({
      name: "Launch venue",
      status: "failed",
      error: BOOM.message,
      pageError: "POST /api/v1/venues failed: 403 Admin role required",
    });
  });

  it("redacts secret-shaped material out of the captured alert text", async () => {
    const { page } = createFakePage(alertWith('Request failed: {"access_token":"abc.def.ghi"}'));
    const journey = createJourneyRecorder(page, "synthetic-journey-1");

    await journey.step("Launch venue", () => Promise.reject(BOOM));

    expect(journey.report().steps[0]?.pageError).not.toContain("abc.def.ghi");
    expect(journey.report().steps[0]?.pageError).toContain("[redacted]");
  });

  it("records no pageError when the page had no visible alert", async () => {
    const { page } = createFakePage(noAlert);
    const journey = createJourneyRecorder(page, "synthetic-journey-1");

    await journey.step("Launch venue", () => Promise.reject(BOOM));

    expect(journey.report().steps[0]).not.toHaveProperty("pageError");
  });

  it("records no pageError when the alert was present but blank", async () => {
    const { page } = createFakePage(alertWith("   \n  "));
    const journey = createJourneyRecorder(page, "synthetic-journey-1");

    await journey.step("Launch venue", () => Promise.reject(BOOM));

    expect(journey.report().steps[0]).not.toHaveProperty("pageError");
  });

  it("never masks the original failure when the alert query throws", async () => {
    const { page, screenshots } = createFakePage(() => {
      throw new Error("Target page, context or browser has been closed");
    });
    const journey = createJourneyRecorder(page, "synthetic-journey-1");

    await journey.step("Launch venue", () => Promise.reject(BOOM));

    expect(journey.report().steps[0]).toMatchObject({ status: "failed", error: BOOM.message });
    expect(journey.report().steps[0]).not.toHaveProperty("pageError");
    // The screenshot is the other half of the diagnosis — capture must not eat it.
    expect(screenshots).toHaveLength(1);
  });

  it("never masks the original failure when reading the alert text rejects", async () => {
    const { page } = createFakePage(() => ({
      count: () => Promise.resolve(1),
      innerText: () => Promise.reject(new Error("Timeout exceeded")),
    }));
    const journey = createJourneyRecorder(page, "synthetic-journey-1");

    await journey.step("Launch venue", () => Promise.reject(BOOM));

    expect(journey.report().steps[0]).toMatchObject({ status: "failed", error: BOOM.message });
    expect(journey.report().steps[0]).not.toHaveProperty("pageError");
  });

  it("leaves a passing step untouched — capture is a failure-path concern", async () => {
    const { page, screenshots } = createFakePage(alertWith("stale banner"));
    const journey = createJourneyRecorder(page, "synthetic-journey-1");

    await journey.step("Launch venue", () => Promise.resolve());

    expect(journey.report().steps[0]).toMatchObject({ status: "passed" });
    expect(journey.report().steps[0]).not.toHaveProperty("pageError");
    expect(screenshots).toHaveLength(0);
  });
});
