import type * as FramerMotion from "framer-motion";
import { render, screen, act } from "@testing-library/react";
import { Odometer } from "./Odometer";

// setup.ts mocks framer-motion useReducedMotion => true globally. Override it
// at file scope so this suite exercises the ANIMATED branch (reduced === false):
// the reel block re-settles with the token spring and SplitFlap reels roll.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof FramerMotion>("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => false,
  };
});

describe("Odometer — animated path (reduced motion off)", () => {
  it("composes rolling SplitFlap reels for each digit run", () => {
    const { container } = render(<Odometer value={1234} locale="en-US" />);
    // "1,234" -> reels for "1" and "234".
    expect(container.querySelectorAll('[role="img"]').length).toBe(2);
  });

  it("still announces the whole value through the polite live region", () => {
    render(<Odometer value={98765} locale="en-US" />);
    expect(screen.getByRole("status")).toHaveTextContent("98,765");
  });

  it("re-renders reels and re-announces on value change", () => {
    const { rerender } = render(<Odometer value={10} locale="en-US" />);
    act(() => {
      rerender(<Odometer value={1000000} locale="en-US" />);
    });
    expect(screen.getByRole("status")).toHaveTextContent("1,000,000");
  });
});
