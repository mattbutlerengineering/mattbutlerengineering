import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";

// axe's label-content-name-mismatch rule measures glyphs on a canvas to skip icon
// ligatures. jsdom has no canvas, so without the stub in setup.ts the rule throws,
// lands in `incomplete`, and every `violations` assertion for it passes vacuously.
const LABEL_RULE = {
  runOnly: { type: "rule" as const, values: ["label-content-name-mismatch"] },
};

describe("axe label-content-name-mismatch evaluates under jsdom", () => {
  it("reports a button whose name does not contain its visible text", async () => {
    const { container } = render(
      <main>
        <button type="button" aria-label="Totally different words">
          Jane Doe 4 guests
        </button>
      </main>
    );
    const result = await axe(container, LABEL_RULE);
    expect(result.violations.map((v) => v.id)).toEqual(["label-content-name-mismatch"]);
  });

  it("passes a button whose name starts with its visible text", async () => {
    const { container } = render(
      <main>
        <button type="button" aria-label="Jane Doe 4 guests, open reservation">
          Jane Doe 4 guests
        </button>
      </main>
    );
    const result = await axe(container, LABEL_RULE);
    expect(result.violations).toEqual([]);
    expect(result.incomplete).toEqual([]);
  });
});
