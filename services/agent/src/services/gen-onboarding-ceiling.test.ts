import { describe, it, expect, beforeEach } from "vitest";
import {
  GEN_ONBOARDING_CEILING_DEFAULT_USD,
  addOnboardingSpend,
  isOnboardingCeilingReached,
  resetOnboardingSpendForTests,
  resolveOnboardingCeilingUsd,
} from "./gen-onboarding-ceiling.js";

describe("resolveOnboardingCeilingUsd", () => {
  it("defaults to $0.05 when unset, blank or invalid", () => {
    expect(GEN_ONBOARDING_CEILING_DEFAULT_USD).toBe(0.05);
    expect(resolveOnboardingCeilingUsd(undefined)).toBe(0.05);
    expect(resolveOnboardingCeilingUsd(" ")).toBe(0.05);
    expect(resolveOnboardingCeilingUsd("abc")).toBe(0.05);
    expect(resolveOnboardingCeilingUsd("-1")).toBe(0.05);
  });

  it("reads a valid override, including zero", () => {
    expect(resolveOnboardingCeilingUsd("0.2")).toBe(0.2);
    expect(resolveOnboardingCeilingUsd("0")).toBe(0);
  });
});

describe("onboarding spend", () => {
  beforeEach(() => resetOnboardingSpendForTests());

  it("is below the ceiling until the user's accumulated cost reaches it", () => {
    const now = 1_000;
    expect(isOnboardingCeilingReached("u1", 50_000, now)).toBe(false);
    addOnboardingSpend("u1", 30_000, now);
    expect(isOnboardingCeilingReached("u1", 50_000, now)).toBe(false);
    addOnboardingSpend("u1", 20_000, now);
    expect(isOnboardingCeilingReached("u1", 50_000, now)).toBe(true);
  });

  it("keys spend by user", () => {
    addOnboardingSpend("u1", 60_000, 1_000);
    expect(isOnboardingCeilingReached("u2", 50_000, 1_000)).toBe(false);
  });

  it("forgets a user's spend after the session window", () => {
    addOnboardingSpend("u1", 60_000, 1_000);
    expect(isOnboardingCeilingReached("u1", 50_000, 1_000 + 24 * 3_600_000 + 1)).toBe(false);
  });
});
