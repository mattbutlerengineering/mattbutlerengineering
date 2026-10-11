import { render } from "@testing-library/react";
import { Handshake } from "./Handshake";
import { stubMatchMedia } from "../../test/match-media";

// setup.ts reports prefers-reduced-motion globally. Stub the device as full
// motion at file scope so this suite exercises the ANIMATED branch.
stubMatchMedia([]);

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
