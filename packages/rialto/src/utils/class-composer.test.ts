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

describe("cn — undefined safety (never emits the string 'undefined')", () => {
  it("cn with an undefined arg produces empty string, not the string 'undefined'", () => {
    const result = cn(undefined as unknown as string);
    expect(result).toBe("");
    expect(result).not.toContain("undefined");
  });

  it("cn mixing a valid class with undefined does not leak 'undefined'", () => {
    const result = cn("foo", undefined as unknown as string, "bar");
    expect(result).toBe("foo bar");
    expect(result).not.toContain("undefined");
  });

  it("cn with a missing CSS Module key (runtime undefined) does not produce 'undefined'", () => {
    const missing = ({} as CSSModuleClasses)["nonexistent"];
    const result = cn("base", missing);
    expect(result).not.toContain("undefined");
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
