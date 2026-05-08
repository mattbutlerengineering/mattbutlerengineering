import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Avatar } from "./Avatar";

// Override the global setup.ts mock so the splitflap effect is not
// short-circuited by reduced-motion in these tests.
vi.mock("framer-motion", async () => {
  const actual =
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- typeof import() required for vi.importActual generic
    await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => false,
  };
});

describe("Avatar", () => {
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

    it("does not render the flap stage if src is unchanged", () => {
      const { rerender } = render(<Avatar src="/a.jpg" name="A" transition="splitflap" />);
      rerender(<Avatar src="/a.jpg" name="A" transition="splitflap" />);
      expect(screen.queryByTestId("avatar-flap-stage")).not.toBeInTheDocument();
    });
  });
});
