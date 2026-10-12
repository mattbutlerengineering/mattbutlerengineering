import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";
import { PREFERS_REDUCED_MOTION, setMatchingMedia, stubMatchMedia } from "../../test/match-media";

// Full motion by default so the splitflap effect is not short-circuited; the
// reduced-motion case flips the device signal useMotionPreset() reads.
stubMatchMedia([]);

describe("Avatar", () => {
  beforeEach(() => {
    setMatchingMedia([]);
  });

  it("renders engraved initials when no src is provided", () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("renders the image when src is provided", () => {
    render(<Avatar src="/a.jpg" name="Ada Lovelace" />);
    const img = screen.getByRole("img", { hidden: true });
    expect(img).toHaveAttribute("src", "/a.jpg");
  });

  it("renders a status LED with the matching aria-label", () => {
    render(<Avatar name="Ada" status="online" />);
    expect(screen.getByRole("img", { name: "online" })).toBeInTheDocument();
  });

  describe("splitflap transition", () => {
    it("does not render the flap stage on initial mount", () => {
      render(<Avatar src="/a.jpg" name="A" transition="splitflap" />);
      expect(screen.queryByTestId("avatar-flap-stage")).not.toBeInTheDocument();
    });

    it("renders the flap stage when src changes with transition='splitflap'", () => {
      const { rerender } = render(<Avatar src="/a.jpg" name="A" transition="splitflap" />);
      expect(screen.queryByTestId("avatar-flap-stage")).not.toBeInTheDocument();

      rerender(<Avatar src="/b.jpg" name="A" transition="splitflap" />);
      expect(screen.getByTestId("avatar-flap-stage")).toBeInTheDocument();
    });

    it("does not render the flap stage when transition defaults to fade", () => {
      const { rerender } = render(<Avatar src="/a.jpg" name="A" />);
      rerender(<Avatar src="/b.jpg" name="A" />);
      expect(screen.queryByTestId("avatar-flap-stage")).not.toBeInTheDocument();
    });

    it("does not render the flap stage under prefers-reduced-motion", () => {
      setMatchingMedia([PREFERS_REDUCED_MOTION]);
      const { rerender } = render(<Avatar src="/a.jpg" name="A" transition="splitflap" />);
      rerender(<Avatar src="/b.jpg" name="A" transition="splitflap" />);
      expect(screen.queryByTestId("avatar-flap-stage")).not.toBeInTheDocument();
    });

    it("does not render the flap stage if src is unchanged", () => {
      const { rerender } = render(<Avatar src="/a.jpg" name="A" transition="splitflap" />);
      rerender(<Avatar src="/a.jpg" name="A" transition="splitflap" />);
      expect(screen.queryByTestId("avatar-flap-stage")).not.toBeInTheDocument();
    });
  });
});
