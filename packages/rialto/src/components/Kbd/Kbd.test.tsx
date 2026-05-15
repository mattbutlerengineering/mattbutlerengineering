import { render, screen } from "@testing-library/react";
import { Kbd, Shortcut } from "./Kbd";

describe("Kbd", () => {
  describe("rendering", () => {
    it("renders a kbd element", () => {
      const { container } = render(<Kbd>Esc</Kbd>);
      expect(container.querySelector("kbd")).toBeInTheDocument();
    });

    it("renders the key text", () => {
      render(<Kbd>Enter</Kbd>);
      expect(screen.getByText("Enter")).toBeInTheDocument();
    });

    it("renders single character keys", () => {
      render(<Kbd>A</Kbd>);
      expect(screen.getByText("A")).toBeInTheDocument();
    });

    it("applies kbd CSS class", () => {
      const { container } = render(<Kbd>K</Kbd>);
      expect(container.querySelector("kbd")?.className).toMatch(/kbd/);
    });

    it("forwards custom className", () => {
      const { container } = render(<Kbd className="my-key">K</Kbd>);
      expect(container.querySelector("kbd")?.className).toMatch(/my-key/);
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the kbd element", () => {
      const ref = { current: null as HTMLElement | null };
      render(<Kbd ref={ref}>K</Kbd>);
      expect(ref.current).toBeInstanceOf(HTMLElement);
      expect(ref.current?.tagName.toLowerCase()).toBe("kbd");
    });
  });
});

describe("Shortcut", () => {
  describe("rendering", () => {
    it("renders each key in the shortcut", () => {
      render(<Shortcut keys={["Ctrl", "K"]} />);
      expect(screen.getByText("Ctrl")).toBeInTheDocument();
      expect(screen.getByText("K")).toBeInTheDocument();
    });

    it("renders + separators between keys", () => {
      render(<Shortcut keys={["Ctrl", "Shift", "P"]} />);
      const separators = screen.getAllByText("+");
      // 3 keys = 2 separators
      expect(separators).toHaveLength(2);
    });

    it("renders a single key without separators", () => {
      render(<Shortcut keys={["Esc"]} />);
      expect(screen.getByText("Esc")).toBeInTheDocument();
      expect(screen.queryByText("+")).not.toBeInTheDocument();
    });

    it("renders symbol keys like cmd", () => {
      render(<Shortcut keys={["⌘", "K"]} />);
      expect(screen.getByText("⌘")).toBeInTheDocument();
    });

    it("applies shortcut CSS class", () => {
      const { container } = render(<Shortcut keys={["Ctrl", "Z"]} />);
      expect(container.firstElementChild?.className).toMatch(/shortcut/);
    });

    it("forwards custom className", () => {
      const { container } = render(<Shortcut keys={["Ctrl", "Z"]} className="my-shortcut" />);
      expect(container.firstElementChild?.className).toMatch(/my-shortcut/);
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the span element", () => {
      const ref = { current: null as HTMLSpanElement | null };
      render(<Shortcut keys={["Ctrl", "K"]} ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });
  });
});
