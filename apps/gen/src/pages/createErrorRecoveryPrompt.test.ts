import { describe, it, expect } from "vitest";
import { createErrorRecoveryPrompt } from "./createErrorRecoveryPrompt.js";

describe("createErrorRecoveryPrompt", () => {
  it("embeds the original prompt", () => {
    const out = createErrorRecoveryPrompt("draw a form", "Invalid nested layout");
    expect(out).toContain("Original prompt: draw a form");
  });

  it("embeds the error message", () => {
    const out = createErrorRecoveryPrompt("draw a form", "Invalid nested layout");
    expect(out).toContain("Error: Invalid nested layout");
  });

  it("instructs the model that the previous attempt failed and asks it to fix the issue", () => {
    const out = createErrorRecoveryPrompt("draw a form", "boom");
    expect(out).toContain("The previous attempt to generate a UI from this prompt failed.");
    expect(out).toContain("fix the issue");
  });

  it("produces a deterministic string for the same inputs", () => {
    expect(createErrorRecoveryPrompt("x", "y")).toBe(createErrorRecoveryPrompt("x", "y"));
  });

  it("preserves the exact composed format", () => {
    const out = createErrorRecoveryPrompt("draw a chart", "Unknown component type");
    expect(out).toBe(
      `The previous attempt to generate a UI from this prompt failed. ` +
        `Please fix the issue and generate a valid, complete spec.\n\n` +
        `Original prompt: draw a chart\n\n` +
        `Error: Unknown component type`
    );
  });
});
