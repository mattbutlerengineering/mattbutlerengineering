import type * as FramerMotion from "framer-motion";
import { render } from "@testing-library/react";
import { Handshake } from "./Handshake";

// setup.ts mocks framer-motion useReducedMotion => true globally. Override it
// at file scope so this suite exercises the ANIMATED branch.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof FramerMotion>("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => false,
  };
});

describe("Handshake — animated path (reduced motion off)", () => {
  it("does not flag reduced motion and keeps the pulse in flight", () => {
    const { container } = render(
      <Handshake aria-label="Verifying" stations={["Browser", "Identity"]} />
    );
    expect(container.firstElementChild).toHaveAttribute("data-reduced-motion", "false");
    expect(container.firstElementChild?.className).not.toMatch(/reduced/);
    expect(container.querySelector("[data-pulse]")).not.toBeNull();
  });
});
