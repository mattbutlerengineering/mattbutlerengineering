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

const STRICT_MODE_VIOLATION = "strict mode violation: resolved to more than one element";

/** Minimal Page stand-in — only the members the recorder actually touches. */
function createFakePage(locator: () => FakeLocator) {
  const screenshots: string[] = [];
  const page = {
    on: () => page,
    // The recorder narrows with `.first()`; reading an unnarrowed multi-match
    // handle throws a strict-mode violation against a real page, so the fake
    // rejects too. That is what makes dropping the `.first()` a visible test
    // failure instead of a silently-wrong capture.
    locator: () => ({
      first: locator,
      count: () => Promise.reject(new Error(STRICT_MODE_VIOLATION)),
      innerText: () => Promise.reject(new Error(STRICT_MODE_VIOLATION)),
    }),
    screenshot: ({ path }: { path: string }) => {
      screenshots.push(path);
      return Promise.resolve();
    },
  };
  return { page: page as unknown as Page, screenshots };
}

/** A locator matching nothing — the page had no visible alert. */
const noAlert = (): FakeLocator => ({
  count: () => Promise.resolve(0),
  innerText: () => Promise.reject(new Error("should not be called")),
});

/**
 * A locator over the visible alerts, in DOM order. `.first()` is the narrowing
 * step under test, so it selects from a real ordered list rather than handing
 * back one canned match — a capture that read any other candidate then fails.
 */
function alertWith(...texts: string[]): () => FakeLocator {
  const candidates: FakeLocator[] = texts.map((text) => ({
    count: () => Promise.resolve(texts.length),
    innerText: () => Promise.resolve(text),
  }));
  return () => candidates[0] ?? noAlert();
}

// The shape of the real #3546 failure: a web-first assertion timeout on the
// celebration status region, not an action-method timeout.
const BOOM = new Error(
  [
    "Timed out 30000ms waiting for expect(locator).toBeVisible()",
    "",
    `Locator: getByRole('status').getByText("You're ready to take reservations")`,
    "Expected: visible",
    "Received: <element(s) not found>",
  ].join("\n")
);

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

  it("captures the leading alert when several are visible at once", async () => {
    // OperatingHoursStep can mount three alerts simultaneously. Which one lands
    // in the report is `.first()`'s call, so pin it: DOM order wins, by design.
    // A wrong-alert capture is worse than no capture — it misdirects triage.
    const { page } = createFakePage(
      alertWith("Closing time must be after opening time", "Pick at least one open day")
    );
    const journey = createJourneyRecorder(page, "synthetic-journey-1");

    await journey.step("Step 3 — set operating hours", () => Promise.reject(BOOM));

    expect(journey.report().steps[0]?.pageError).toBe("Closing time must be after opening time");
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
