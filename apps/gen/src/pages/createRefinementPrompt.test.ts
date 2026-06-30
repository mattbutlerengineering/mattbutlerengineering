import { describe, it, expect } from "vitest";
import type { Spec } from "@json-render/react";
import { createRefinementPrompt } from "./createRefinementPrompt.js";

// Minimal Spec-shaped fixture; createRefinementPrompt only serializes it.
const spec = { type: "Box", children: [] } as unknown as Spec;

describe("createRefinementPrompt", () => {
  it("embeds the serialized current spec as context", () => {
    const out = createRefinementPrompt(spec, "make it blue");
    expect(out).toContain(`Existing spec:\n${JSON.stringify(spec)}`);
  });

  it("embeds the user instruction", () => {
    const out = createRefinementPrompt(spec, "make it blue");
    expect(out).toContain("Modification requested: make it blue");
  });

  it("instructs the model to output the complete modified spec", () => {
    const out = createRefinementPrompt(spec, "x");
    expect(out).toContain(
      "Output the COMPLETE modified spec (not just the changes).",
    );
    expect(out).toContain(
      "Here is an existing UI spec generated from Rialto components.",
    );
  });

  it("produces a deterministic string for the same inputs", () => {
    expect(createRefinementPrompt(spec, "y")).toBe(
      createRefinementPrompt(spec, "y"),
    );
  });

  it("preserves the exact composed format", () => {
    const out = createRefinementPrompt(spec, "tweak");
    expect(out).toBe(
      `Here is an existing UI spec generated from Rialto components. ` +
        `Please modify it according to the user's instruction. ` +
        `Output the COMPLETE modified spec (not just the changes).\n\n` +
        `Existing spec:\n${JSON.stringify(spec)}\n\n` +
        `Modification requested: tweak`,
    );
  });
});
