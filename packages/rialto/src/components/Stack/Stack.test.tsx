import { render, screen } from "@testing-library/react";
import { Stack } from "./Stack";

describe("Stack", () => {
  describe("rendering", () => {
    it("renders children", () => {
      render(
        <Stack>
          <span>Item A</span>
          <span>Item B</span>
        </Stack>
      );
      expect(screen.getByText("Item A")).toBeInTheDocument();
      expect(screen.getByText("Item B")).toBeInTheDocument();
    });

    it("renders as a div by default", () => {
      const { container } = render(<Stack>content</Stack>);
      expect(container.firstElementChild?.tagName).toBe("DIV");
    });

    it("applies stack CSS class", () => {
      const { container } = render(<Stack>content</Stack>);
      expect(container.firstElementChild?.className).toMatch(/stack/);
    });
  });

  describe("direction", () => {
    it("renders column by default (no row class)", () => {
      const { container } = render(<Stack>content</Stack>);
      expect(container.firstElementChild?.className).not.toMatch(/\brow\b/);
    });

    it("applies row class when direction=row", () => {
      const { container } = render(<Stack direction="row">content</Stack>);
      expect(container.firstElementChild?.className).toMatch(/row/);
    });
  });

  describe("gap", () => {
    it("applies gap class when gap is provided", () => {
      const { container } = render(<Stack gap="md">content</Stack>);
      expect(container.firstElementChild?.className).toMatch(/gapMd/);
    });

    it("applies sm gap class", () => {
      const { container } = render(<Stack gap="sm">content</Stack>);
      expect(container.firstElementChild?.className).toMatch(/gapSm/);
    });

    it("applies xl gap class", () => {
      const { container } = render(<Stack gap="xl">content</Stack>);
      expect(container.firstElementChild?.className).toMatch(/gapXl/);
    });
  });

  describe("align", () => {
    it("applies alignCenter class", () => {
      const { container } = render(<Stack align="center">content</Stack>);
      expect(container.firstElementChild?.className).toMatch(/alignCenter/);
    });

    it("applies alignEnd class", () => {
      const { container } = render(<Stack align="end">content</Stack>);
      expect(container.firstElementChild?.className).toMatch(/alignEnd/);
    });
  });

  describe("justify", () => {
    it("applies justifyBetween class", () => {
      const { container } = render(<Stack justify="between">content</Stack>);
      expect(container.firstElementChild?.className).toMatch(/justifyBetween/);
    });

    it("applies justifyCenter class", () => {
      const { container } = render(<Stack justify="center">content</Stack>);
      expect(container.firstElementChild?.className).toMatch(/justifyCenter/);
    });
  });

  describe("wrap", () => {
    it("does not apply wrap class by default", () => {
      const { container } = render(<Stack>content</Stack>);
      expect(container.firstElementChild?.className).not.toMatch(/\bwrap\b/);
    });

    it("applies wrap class when wrap=true", () => {
      const { container } = render(<Stack wrap>content</Stack>);
      expect(container.firstElementChild?.className).toMatch(/wrap/);
    });
  });

  describe("as prop", () => {
    it("renders as a ul when as=ul", () => {
      const { container } = render(<Stack as="ul">content</Stack>);
      expect(container.firstElementChild?.tagName).toBe("UL");
    });

    it("renders as a section when as=section", () => {
      const { container } = render(<Stack as="section">content</Stack>);
      expect(container.firstElementChild?.tagName).toBe("SECTION");
    });
  });

  describe("className and ref", () => {
    it("forwards custom className", () => {
      const { container } = render(<Stack className="my-stack">content</Stack>);
      expect(container.firstElementChild?.className).toMatch(/my-stack/);
    });

    it("forwards ref to the element", () => {
      const ref = { current: null as HTMLElement | null };
      render(<Stack ref={ref}>content</Stack>);
      expect(ref.current).toBeInstanceOf(HTMLElement);
    });
  });
});
