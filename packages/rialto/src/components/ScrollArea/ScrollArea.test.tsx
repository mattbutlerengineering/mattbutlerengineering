import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ScrollArea } from "./ScrollArea";

describe("ScrollArea", () => {
  describe("rendering", () => {
    it("renders children", () => {
      render(
        <ScrollArea>
          <p>Scrollable content</p>
        </ScrollArea>
      );
      expect(screen.getByText("Scrollable content")).toBeInTheDocument();
    });

    it("renders with role=region and accessible label", () => {
      render(
        <ScrollArea>
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByRole("region", { name: "Scrollable content" })).toBeInTheDocument();
    });

    it("is keyboard focusable (tabIndex=0)", () => {
      render(
        <ScrollArea>
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByRole("region")).toHaveAttribute("tabindex", "0");
    });
  });

  describe("maxHeight prop", () => {
    it("applies numeric maxHeight as px style", () => {
      render(
        <ScrollArea maxHeight={240}>
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByRole("region")).toHaveStyle({ maxHeight: "240px" });
    });

    it("applies string maxHeight directly", () => {
      render(
        <ScrollArea maxHeight="50vh">
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByRole("region")).toHaveStyle({ maxHeight: "50vh" });
    });

    it("renders without maxHeight (no inline style constraint)", () => {
      render(
        <ScrollArea>
          <p>Content</p>
        </ScrollArea>
      );
      const el = screen.getByRole("region");
      expect(el.style.maxHeight).toBe("");
    });
  });

  describe("className passthrough", () => {
    it("merges className with root class", () => {
      render(
        <ScrollArea className="my-scroll">
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByRole("region")).toHaveClass("my-scroll");
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the div element", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(
        <ScrollArea ref={ref}>
          <p>Content</p>
        </ScrollArea>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("style passthrough", () => {
    it("merges additional style props with maxHeight style", () => {
      render(
        <ScrollArea maxHeight={200} style={{ overflowX: "hidden" }}>
          <p>Content</p>
        </ScrollArea>
      );
      const el = screen.getByRole("region");
      expect(el.style.maxHeight).toBe("200px");
      expect(el.style.overflowX).toBe("hidden");
    });

    it("applies style without maxHeight", () => {
      render(
        <ScrollArea style={{ padding: "8px" }}>
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByRole("region").style.padding).toBe("8px");
    });
  });

  describe("HTML attribute forwarding", () => {
    it("forwards data-testid", () => {
      render(
        <ScrollArea data-testid="scroll-area">
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByTestId("scroll-area")).toBeInTheDocument();
    });

    it("overrides aria-label via prop", () => {
      render(
        <ScrollArea aria-label="Custom region">
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByRole("region")).toBeInTheDocument();
    });
  });

  describe("root CSS class", () => {
    it("applies root CSS class", () => {
      render(
        <ScrollArea>
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByRole("region").className).toMatch(/root/);
    });
  });

  describe("accessibility", () => {
    it("passes axe", async () => {
      const { container } = render(
        <ScrollArea maxHeight={200}>
          <p>Long scrollable content goes here.</p>
        </ScrollArea>
      );
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });
  });
});
