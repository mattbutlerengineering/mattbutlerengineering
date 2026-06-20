import { describe, it, expect } from "vitest";
import { cn, variantClass } from "./class-composer";

describe("cn", () => {
  it("joins truthy strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("filters falsy values", () => {
    expect(cn("foo", false, undefined, null, "", "bar")).toBe("foo bar");
  });

  it("returns empty string when all falsy", () => {
    expect(cn(false, undefined, null, "")).toBe("");
  });

  it("handles a single class", () => {
    expect(cn("only")).toBe("only");
  });

  it("handles no args", () => {
    expect(cn()).toBe("");
  });
});

describe("variantClass", () => {
  const styles = {
    neutral: "badge-neutral",
    accent: "badge-accent",
    sm: "badge-sm",
    md: "badge-md",
  } as unknown as CSSModuleClasses;

  it("returns the variant class when not the default", () => {
    expect(variantClass(styles, "accent", "neutral")).toBe("badge-accent");
  });

  it("returns empty string for the default variant (omit-default rule)", () => {
    expect(variantClass(styles, "neutral", "neutral")).toBe("");
  });

  it("returns empty string for the default size (omit-default rule)", () => {
    const sizeStyles = { sm: "sz-sm", md: "sz-md" } as unknown as CSSModuleClasses;
    expect(variantClass(sizeStyles, "md", "md")).toBe("");
  });

  it("returns non-default size class", () => {
    const sizeStyles = { sm: "sz-sm", md: "sz-md" } as unknown as CSSModuleClasses;
    expect(variantClass(sizeStyles, "sm", "md")).toBe("sz-sm");
  });

  it("guards a missing key — returns empty string, not undefined", () => {
    expect(variantClass(styles, "missing-key" as string, "neutral")).toBe("");
  });

  it("guards a key whose CSS Module value is undefined — returns empty string", () => {
    const sparseStyles = { neutral: undefined } as unknown as CSSModuleClasses;
    expect(variantClass(sparseStyles, "neutral", "something-else")).toBe("");
  });
});
