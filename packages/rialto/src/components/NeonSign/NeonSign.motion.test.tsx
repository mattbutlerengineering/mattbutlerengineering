import { render } from "@testing-library/react";
import { NeonSign } from "./NeonSign";
import { stubMatchMedia } from "../../test/match-media";

// setup.ts reports prefers-reduced-motion globally. Stub the device as full
// motion at file scope so this suite exercises the ANIMATED branch.
stubMatchMedia([]);

describe("NeonSign — animated path (reduced motion off)", () => {
  it("does not flag reduced motion and lights the tube in the state the strike keys on", () => {
    const { container } = render(<NeonSign state="open" aria-label="Open until 10:00 PM" />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute("data-reduced-motion", "false");
    expect(root?.className).not.toMatch(/reduced/);
    // The strike-on keyframe is CSS-bound to `[data-state="open"] .tube`; jsdom
    // sees no keyframes, so assert the DOM state that selector matches.
    expect(root).toHaveAttribute("data-state", "open");
    expect(container.querySelector("[data-tube]")).toHaveAttribute("data-lit", "true");
  });
});
