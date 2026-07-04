import { describe, it, expect } from "vitest";
import { validateBasicInfo, isValidSlug } from "./BasicInfoStep.js";

describe("isValidSlug", () => {
  it("accepts lowercase alphanumeric with hyphens", () => {
    expect(isValidSlug("the-grand-ballroom")).toBe(true);
  });

  it("rejects uppercase letters", () => {
    expect(isValidSlug("The-Grand")).toBe(false);
  });

  it("rejects leading/trailing hyphens", () => {
    expect(isValidSlug("-grand-")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSlug("")).toBe(false);
  });
});

describe("validateBasicInfo", () => {
  it("requires name to be at least 2 characters", () => {
    const errors = validateBasicInfo({ name: "A", slug: "a-slug", venueGroupId: "" }, "idle");
    expect(errors.name).toBe("Name must be at least 2 characters");
  });

  it("requires slug", () => {
    const errors = validateBasicInfo({ name: "Venue", slug: "", venueGroupId: "" }, "idle");
    expect(errors.slug).toBe("Slug is required");
  });

  it("rejects slug with invalid characters", () => {
    const errors = validateBasicInfo(
      { name: "Venue", slug: "Not Valid!", venueGroupId: "" },
      "idle"
    );
    expect(errors.slug).toBe("Slug must be URL-safe (lowercase letters, numbers, hyphens)");
  });

  it("surfaces a taken-slug error from slugStatus", () => {
    const errors = validateBasicInfo(
      { name: "Venue", slug: "taken-slug", venueGroupId: "" },
      "taken"
    );
    expect(errors.slug).toBe("A venue with this slug already exists");
  });

  it("returns no errors for valid data with an available slug", () => {
    const errors = validateBasicInfo(
      { name: "Venue", slug: "the-venue", venueGroupId: "" },
      "available"
    );
    expect(errors).toEqual({});
  });

  it("returns no errors when slugStatus is idle and format is valid", () => {
    const errors = validateBasicInfo(
      { name: "Venue", slug: "the-venue", venueGroupId: "" },
      "idle"
    );
    expect(errors).toEqual({});
  });
});
