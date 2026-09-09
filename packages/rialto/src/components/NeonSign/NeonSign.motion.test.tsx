import type * as FramerMotion from "framer-motion";
import { render } from "@testing-library/react";
import { NeonSign } from "./NeonSign";

// setup.ts mocks framer-motion useReducedMotion => true globally. Override it
// at file scope so this suite exercises the ANIMATED branch.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof FramerMotion>("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => false,
  };
});

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
