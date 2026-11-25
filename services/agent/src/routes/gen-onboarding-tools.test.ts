import { describe, it, expect } from "vitest";
import { OFFERED_CURRENCY_CODES, OFFERED_TIMEZONES } from "@mbe/types";
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
    expect([...ONBOARDING_STEPS].sort()).toEqual([
      "floorPlan",
      "hours",
      "locationTime",
      "settings",
    ]);
  });
});

describe("proposeOnboardingPatch: the form's own lists (#9475)", () => {
  it("rejects a real IANA zone the form does not offer", () => {
    const result = proposeOnboardingPatch({
      step: "locationTime",
      data: { ianaTimezone: "America/Detroit" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a well-formed currency the form does not offer", () => {
    const result = proposeOnboardingPatch({ step: "locationTime", data: { currencyCode: "CZK" } });
    expect(result.ok).toBe(false);
  });

  it("accepts every zone and currency the form offers", () => {
    for (const ianaTimezone of OFFERED_TIMEZONES) {
      expect(proposeOnboardingPatch({ step: "locationTime", data: { ianaTimezone } }).ok).toBe(
        true
      );
    }
    for (const currencyCode of OFFERED_CURRENCY_CODES) {
      expect(proposeOnboardingPatch({ step: "locationTime", data: { currencyCode } }).ok).toBe(
        true
      );
    }
  });
});

describe("proposeOnboardingPatch: hours", () => {
  it("accepts a full and a partial hours patch", () => {
    const full = {
      serviceName: "Dinner",
      opens: "17:00",
      closes: "22:30",
      lastSeating: "21:45",
      days: "tue,wed,thu,fri,sat",
    };
    expect(proposeOnboardingPatch({ step: "hours", data: full })).toEqual({
      ok: true,
      patch: { step: "hours", data: full },
    });
    expect(proposeOnboardingPatch({ step: "hours", data: { opens: "11:30" } }).ok).toBe(true);
  });

  it("rejects a time that is not 24-hour HH:mm", () => {
    for (const opens of ["5pm", "25:00", "17:60", "7:00", "17:00:00"]) {
      expect(proposeOnboardingPatch({ step: "hours", data: { opens } }).ok, opens).toBe(false);
    }
  });

  it("rejects an unknown day, a blank name and a name over the service limit", () => {
    expect(proposeOnboardingPatch({ step: "hours", data: { days: "mon,funday" } }).ok).toBe(false);
    expect(proposeOnboardingPatch({ step: "hours", data: { serviceName: "  " } }).ok).toBe(false);
    expect(
      proposeOnboardingPatch({ step: "hours", data: { serviceName: "x".repeat(41) } }).ok
    ).toBe(false);
  });
});

describe("proposeOnboardingPatch: floor plan", () => {
  it("accepts a template, a size, or both", () => {
    expect(proposeOnboardingPatch({ step: "floorPlan", data: { templateId: "cafe" } }).ok).toBe(
      true
    );
    expect(proposeOnboardingPatch({ step: "floorPlan", data: { roomSize: "grand" } }).ok).toBe(
      true
    );
    expect(
      proposeOnboardingPatch({
        step: "floorPlan",
        data: { templateId: "fine-dining", roomSize: "cozy" },
      }).ok
    ).toBe(true);
  });

  it("rejects a template or size the step does not offer", () => {
    expect(proposeOnboardingPatch({ step: "floorPlan", data: { templateId: "ballroom" } }).ok).toBe(
      false
    );
    expect(proposeOnboardingPatch({ step: "floorPlan", data: { roomSize: "huge" } }).ok).toBe(
      false
    );
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
