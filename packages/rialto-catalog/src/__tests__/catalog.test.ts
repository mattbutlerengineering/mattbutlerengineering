import { describe, it, expect } from "vitest";
import { catalog } from "../catalog.js";

describe("catalog.prompt()", () => {
  it("returns a non-empty string", () => {
    const prompt = catalog.prompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("output contains Button component reference", () => {
    const prompt = catalog.prompt();
    expect(prompt).toContain("Button");
  });

  it("output contains Card component reference", () => {
    const prompt = catalog.prompt();
    expect(prompt).toContain("Card");
  });

  it("output contains validateForm action", () => {
    const prompt = catalog.prompt();
    expect(prompt).toContain("validateForm");
  });

  it("output contains navigate action", () => {
    const prompt = catalog.prompt();
    expect(prompt).toContain("navigate");
  });

  it("output contains setState built-in action", () => {
    const prompt = catalog.prompt();
    expect(prompt).toContain("setState");
  });

  it("catalog has at least 20 components", () => {
    expect(catalog.componentNames.length).toBeGreaterThanOrEqual(20);
  });

  it("customRules appear in prompt output", () => {
    const customRule = "Always use Stack as root.";
    const prompt = catalog.prompt({ customRules: [customRule] });
    expect(prompt).toContain(customRule);
  });
});
