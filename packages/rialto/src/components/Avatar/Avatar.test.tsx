import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { Avatar, AvatarGroup } from "./Avatar";
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

describe("AvatarGroup", () => {
  it("gives the overflow badge an accessible name and no axe violations", async () => {
    const { container } = render(
      <AvatarGroup avatars={[{ name: "Alice" }, { name: "Bob" }, { name: "Cara" }]} max={2} />
    );

    expect(screen.getByRole("img", { name: "1 more" })).toBeInTheDocument();
    expect(
      await axe(container, { rules: { "color-contrast": { enabled: false } } })
    ).toHaveNoViolations();
  });

  it("packs a stretched group toward the start edge without changing stack order", () => {
    // jsdom does not apply CSS modules, so the rule under test is read from
    // the stylesheet and injected. row-reverse keeps the first avatar on top;
    // justify-content: flex-end is the inline-start in that direction, which
    // is what stops a column-flex parent from pinning the stack to the end.
    const css = fs.readFileSync(path.join(__dirname, "Avatar.module.css"), "utf8");
    const groupRule = css.match(/\.group\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(groupRule).toMatch(/flex-direction:\s*row-reverse/);
    expect(groupRule).toMatch(/justify-content:\s*flex-end/);

    const style = document.createElement("style");
    style.textContent = `.group { ${groupRule} }`;
    document.head.appendChild(style);

    const { container } = render(
      <div style={{ display: "flex", flexDirection: "column", width: "480px" }}>
        <AvatarGroup
          max={3}
          avatars={[
            { name: "Charles Leclerc" },
            { name: "Lewis Hamilton" },
            { name: "Marc Newson" },
            { name: "Adrian Newey" },
          ]}
        />
      </div>
    );

    const group = container.querySelector(".group");
    expect(group).not.toBeNull();
    const computed = getComputedStyle(group as HTMLElement);
    expect(computed.flexDirection).toBe("row-reverse");
    expect(computed.justifyContent).toBe("flex-end");

    const labels = [...(group as HTMLElement).querySelectorAll("[aria-label]")].map((el) =>
      el.getAttribute("aria-label")
    );
    expect(labels).toEqual(["1 more", "Marc Newson", "Lewis Hamilton", "Charles Leclerc"]);

    style.remove();
  });
});
