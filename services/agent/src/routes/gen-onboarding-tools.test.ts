import { describe, it, expect } from "vitest";
import { KILL_TEST_PHRASINGS } from "./gen-onboarding-kill-test.fixture.js";
import {
  ONBOARDING_STEPS,
  proposeOnboardingPatch,
  createOnboardingTools,
} from "./gen-onboarding-tools.js";

describe("proposeOnboardingPatch", () => {
  it("returns a valid locationTime patch unchanged", () => {
    expect(
      proposeOnboardingPatch({
        step: "locationTime",
        data: { ianaTimezone: "Europe/Lisbon", currencyCode: "EUR" },
      })
    ).toEqual({
      ok: true,
      patch: {
        step: "locationTime",
        data: { ianaTimezone: "Europe/Lisbon", currencyCode: "EUR" },
      },
    });
  });

  it("accepts a partial patch", () => {
    const result = proposeOnboardingPatch({
      step: "locationTime",
      data: { ianaTimezone: "America/Los_Angeles" },
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a settings patch with string numerals", () => {
    const result = proposeOnboardingPatch({
      step: "settings",
      data: { defaultReservationDuration: "90", maxPartySize: "8", advanceBookingDays: "60" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an invented time zone", () => {
    const result = proposeOnboardingPatch({
      step: "locationTime",
      data: { ianaTimezone: "Mars/Olympus" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed currency code", () => {
    const result = proposeOnboardingPatch({
      step: "locationTime",
      data: { currencyCode: "euros" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects fields that belong to another step", () => {
    const result = proposeOnboardingPatch({
      step: "locationTime",
      data: { maxPartySize: "8" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown step and an empty patch", () => {
    expect(proposeOnboardingPatch({ step: "launch", data: {} }).ok).toBe(false);
    expect(proposeOnboardingPatch({ step: "locationTime", data: {} }).ok).toBe(false);
  });

  it("rejects non-numeric settings values", () => {
    expect(proposeOnboardingPatch({ step: "settings", data: { maxPartySize: "lots" } }).ok).toBe(
      false
    );
  });

  it("covers exactly the steps the client gate knows", () => {
    expect([...ONBOARDING_STEPS].sort()).toEqual(["locationTime", "settings"]);
  });
});

describe("kill-test fixture", () => {
  it("holds ten phrasings, each with an expected IANA zone that validates", () => {
    expect(KILL_TEST_PHRASINGS).toHaveLength(10);
    for (const { phrasing, expected } of KILL_TEST_PHRASINGS) {
      expect(phrasing.length).toBeGreaterThan(3);
      expect(proposeOnboardingPatch({ step: "locationTime", data: expected }).ok).toBe(true);
    }
  });
});

describe("createOnboardingTools", () => {
  it("registers only propose_onboarding_patch, which performs no I/O and returns the patch", async () => {
    const tools = createOnboardingTools();
    expect(Object.keys(tools)).toEqual(["propose_onboarding_patch"]);
    const execute = (
      tools.propose_onboarding_patch as unknown as {
        execute: (input: unknown) => Promise<unknown>;
      }
    ).execute;
    await expect(
      execute({ step: "locationTime", data: { ianaTimezone: "Europe/Lisbon" } })
    ).resolves.toEqual({
      ok: true,
      patch: { step: "locationTime", data: { ianaTimezone: "Europe/Lisbon" } },
    });
  });
});
