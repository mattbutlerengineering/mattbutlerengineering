import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Text } from "./Text";

describe("Text", () => {
  describe("rendering", () => {
    it("renders body variant as <p> by default", () => {
      render(<Text>Hello world</Text>);
      expect(screen.getByText("Hello world").tagName).toBe("P");
    });

    it("renders caption variant as <p>", () => {
      render(<Text variant="caption">Caption text</Text>);
      expect(screen.getByText("Caption text").tagName).toBe("P");
    });

    it("renders detail variant as <span>", () => {
      render(<Text variant="detail">Detail text</Text>);
      expect(screen.getByText("Detail text").tagName).toBe("SPAN");
    });

    it("renders label variant as <span>", () => {
      render(<Text variant="label">Label text</Text>);
      expect(screen.getByText("Label text").tagName).toBe("SPAN");
    });

    it("renders display variant as <p>", () => {
      render(<Text variant="display">Display text</Text>);
      expect(screen.getByText("Display text").tagName).toBe("P");
    });

    it("renders children", () => {
      render(<Text>My text content</Text>);
      expect(screen.getByText("My text content")).toBeInTheDocument();
    });
  });

  describe("as prop", () => {
    it("renders as custom element", () => {
      render(<Text as="span">Hello</Text>);
      expect(screen.getByText("Hello").tagName).toBe("SPAN");
    });

    it("renders as h2", () => {
      render(<Text as="h2">Heading</Text>);
      expect(screen.getByRole("heading", { level: 2, name: "Heading" })).toBeInTheDocument();
    });
  });

  describe("color variants", () => {
    const colors = [
      "primary",
      "secondary",
      "tertiary",
      "accent",
      "success",
      "warning",
      "error",
      "on-accent",
    ] as const;

    colors.forEach((color) => {
      it(`renders ${color} color without crashing`, () => {
        render(<Text color={color}>Text</Text>);
        expect(screen.getByText("Text")).toBeInTheDocument();
      });
    });
  });

  describe("alignment", () => {
    const aligns = ["left", "center", "right"] as const;
    aligns.forEach((align) => {
      it(`renders ${align} alignment`, () => {
        render(<Text align={align}>Text</Text>);
        expect(screen.getByText("Text")).toBeInTheDocument();
      });
    });
  });

  describe("modifiers", () => {
    it("renders with mono=true", () => {
      render(<Text mono>Code text</Text>);
      expect(screen.getByText("Code text")).toBeInTheDocument();
    });

    it("renders with truncate=true", () => {
      render(<Text truncate>Very long text...</Text>);
      expect(screen.getByText("Very long text...")).toBeInTheDocument();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the element", () => {
      const ref = { current: null as HTMLElement | null };
      render(<Text ref={ref}>Hello</Text>);
      expect(ref.current).toBeInstanceOf(HTMLParagraphElement);
    });
  });

  describe("accessibility", () => {
    it("passes axe for body variant", async () => {
      const { container } = render(
        <Text variant="body" color="primary">
          Sample body text
        </Text>
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });

    it("passes axe for caption variant", async () => {
      const { container } = render(
        <Text variant="caption" color="secondary">
          Caption text
        </Text>
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
