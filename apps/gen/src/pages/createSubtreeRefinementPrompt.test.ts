import { describe, it, expect } from "vitest";
import type { Spec } from "@json-render/react";
import { createSubtreeRefinementPrompt } from "./createSubtreeRefinementPrompt.js";

const SUBTREE: Spec = {
  root: "card",
  elements: { card: { type: "Stack", props: {}, children: [] } },
};

describe("createSubtreeRefinementPrompt", () => {
  const prompt = createSubtreeRefinementPrompt(
    SUBTREE,
    [{ key: "root", type: "Page" }],
    "make this a 3-column grid"
  );

  it("embeds the subtree, ancestry and instruction", () => {
    expect(prompt).toContain(JSON.stringify(SUBTREE));
    expect(prompt).toContain(JSON.stringify([{ key: "root", type: "Page" }]));
    expect(prompt).toContain("Modification requested: make this a 3-column grid");
  });

  it("asks for only the replacement subtree with the root key preserved", () => {
    expect(prompt).toContain("ONLY");
    expect(prompt).toContain('"card"');
    expect(prompt).not.toContain("COMPLETE modified spec");
  });
});
