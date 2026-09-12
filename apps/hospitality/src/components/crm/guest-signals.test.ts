import { describe, it, expect } from "vitest";
import {
  ALLERGY_KEYWORDS,
  isAllergyTag,
  getSegmentLabel,
  getSegmentVariant,
} from "./guest-signals.js";

describe("guest-signals", () => {
  describe("ALLERGY_KEYWORDS", () => {
    it("is the shared list from ux.md Screen 1: allergy, nut, shellfish, dairy", () => {
      expect([...ALLERGY_KEYWORDS]).toEqual(["allergy", "nut", "shellfish", "dairy"]);
    });
  });

  describe("isAllergyTag", () => {
    it.each(["nut allergy", "Shellfish", "no dairy", "peanut-free", "Allergy: sesame"])(
      "%j is an allergy tag",
      (tag) => {
        expect(isAllergyTag(tag)).toBe(true);
      }
    );

    it.each(["vegetarian", "gluten-free", "vegan", "halal", ""])(
      "%j is not an allergy tag",
      (tag) => {
        expect(isAllergyTag(tag)).toBe(false);
      }
    );
  });

  describe("getSegmentLabel", () => {
    it("is VIP on a vip tag regardless of case", () => {
      expect(getSegmentLabel(1, ["vip"])).toBe("VIP");
      expect(getSegmentLabel(1, ["VIP"])).toBe("VIP");
    });

    it("is VIP at ten or more visits without a tag", () => {
      expect(getSegmentLabel(10, null)).toBe("VIP");
      expect(getSegmentLabel(12, [])).toBe("VIP");
    });

    it("is Repeat from the second visit", () => {
      expect(getSegmentLabel(2, null)).toBe("Repeat");
      expect(getSegmentLabel(9, ["regular"])).toBe("Repeat");
    });

    it("is New otherwise", () => {
      expect(getSegmentLabel(0, null)).toBe("New");
      expect(getSegmentLabel(1, [])).toBe("New");
    });
  });

  describe("getSegmentVariant", () => {
    it.each([
      ["VIP", "accent"],
      ["Repeat", "success"],
      ["New", "neutral"],
    ] as const)("%s → %s", (label, variant) => {
      expect(getSegmentVariant(label)).toBe(variant);
    });
  });
});
