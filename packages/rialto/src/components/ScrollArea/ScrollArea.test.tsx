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

    it("has role=region", () => {
      render(
        <ScrollArea>
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByRole("region")).toBeInTheDocument();
    });

    it("has aria-label", () => {
      render(
        <ScrollArea>
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByRole("region")).toHaveAttribute(
        "aria-label",
        "Scrollable content"
      );
    });

    it("is keyboard focusable (tabIndex=0)", () => {
      render(
        <ScrollArea>
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByRole("region")).toHaveAttribute("tabIndex", "0");
    });

    it("applies maxHeight as a number", () => {
      render(
        <ScrollArea maxHeight={240}>
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByRole("region")).toHaveStyle({ maxHeight: "240px" });
    });

    it("applies maxHeight as a string", () => {
      render(
        <ScrollArea maxHeight="50vh">
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByRole("region")).toHaveStyle({ maxHeight: "50vh" });
    });

    it("applies custom className", () => {
      const { container } = render(
        <ScrollArea className="custom-scroll">
          <p>Content</p>
        </ScrollArea>
      );
      expect(container.querySelector(".custom-scroll")).toBeInTheDocument();
    });

    it("forwards additional props", () => {
      render(
        <ScrollArea data-testid="scroll-area">
          <p>Content</p>
        </ScrollArea>
      );
      expect(screen.getByTestId("scroll-area")).toBeInTheDocument();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to root div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(
        <ScrollArea ref={ref}>
          <p>Content</p>
        </ScrollArea>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("accessibility", () => {
    it("passes axe", async () => {
      const { container } = render(
        <ScrollArea maxHeight={200}>
          <p>Long scrollable content goes here.</p>
        </ScrollArea>
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
