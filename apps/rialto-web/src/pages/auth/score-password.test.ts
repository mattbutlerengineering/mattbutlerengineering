import { describe, it, expect } from "vitest";
import {
  scorePassword,
  meterVariantForScore,
  STRENGTH_LABELS,
  MIN_PASSWORD_LENGTH,
} from "./score-password";

describe("scorePassword — requirement detection", () => {
  it("empty password satisfies nothing and scores 0", () => {
    const result = scorePassword("");
    expect(result.score).toBe(0);
    expect(result.satisfied).toEqual({
      minLength: false,
      mixedCase: false,
      numberOrSymbol: false,
    });
  });

  it("satisfies minLength at exactly the minimum, not one below", () => {
    const atMin = "a".repeat(MIN_PASSWORD_LENGTH);
    const belowMin = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(scorePassword(atMin).satisfied.minLength).toBe(true);
    expect(scorePassword(belowMin).satisfied.minLength).toBe(false);
  });

  it("mixedCase requires both an upper- and a lower-case letter", () => {
    expect(scorePassword("alllowercase").satisfied.mixedCase).toBe(false);
    expect(scorePassword("ALLUPPERCASE").satisfied.mixedCase).toBe(false);
    expect(scorePassword("Mixed").satisfied.mixedCase).toBe(true);
  });

  it("numberOrSymbol is satisfied by a digit", () => {
    expect(scorePassword("abc1").satisfied.numberOrSymbol).toBe(true);
  });

  it("numberOrSymbol is satisfied by a symbol", () => {
    expect(scorePassword("abc!").satisfied.numberOrSymbol).toBe(true);
  });

  it("numberOrSymbol is not satisfied by letters alone", () => {
    expect(scorePassword("abcDef").satisfied.numberOrSymbol).toBe(false);
  });
});

describe("scorePassword — score scale", () => {
  it("scores 1 with a single requirement satisfied", () => {
    // Long enough, single case, no number/symbol
    expect(scorePassword("aaaaaaaaaaaa").score).toBe(1);
    // Mixed case only
    expect(scorePassword("Ab").score).toBe(1);
    // Number only
    expect(scorePassword("1234").score).toBe(1);
  });

  it("scores 2 with two requirements satisfied", () => {
    // Mixed case + number, too short
    expect(scorePassword("Ab1").score).toBe(2);
    // Length + number, single case
    expect(scorePassword("aaaaaaaaaaa1").score).toBe(2);
  });

  it("scores 3 with all requirements satisfied at minimum length", () => {
    // Exactly 12 chars, mixed case, number
    expect(scorePassword("Abcdefghijk1").score).toBe(3);
  });

  it("scores 4 with all requirements satisfied and generous length (16+)", () => {
    expect(scorePassword("Abcdefghijklmno1").score).toBe(4);
  });

  it("does not award the bonus point below 16 characters", () => {
    // 15 chars, all requirements met
    expect(scorePassword("Abcdefghijklmn1").score).toBe(3);
  });

  it("never awards the bonus point unless all requirements are met", () => {
    // 20 chars but single case, no number/symbol: only minLength satisfied
    expect(scorePassword("a".repeat(20)).score).toBe(1);
  });
});

describe("meterVariantForScore", () => {
  it("maps weak scores to error", () => {
    expect(meterVariantForScore(0)).toBe("error");
    expect(meterVariantForScore(1)).toBe("error");
  });

  it("maps a middling score to default", () => {
    expect(meterVariantForScore(2)).toBe("default");
  });

  it("maps strong scores to success", () => {
    expect(meterVariantForScore(3)).toBe("success");
    expect(meterVariantForScore(4)).toBe("success");
  });
});

describe("STRENGTH_LABELS", () => {
  it("has one label per score value 0-4", () => {
    expect(STRENGTH_LABELS).toHaveLength(5);
    for (const label of STRENGTH_LABELS) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
