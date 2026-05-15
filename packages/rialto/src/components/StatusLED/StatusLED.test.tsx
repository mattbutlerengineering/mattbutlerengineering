import { render, screen } from "@testing-library/react";
import { StatusLED } from "./StatusLED";

describe("StatusLED", () => {
  describe("rendering", () => {
    it("renders a span element", () => {
      const { container } = render(<StatusLED />);
      expect(container.querySelector("span")).toBeInTheDocument();
    });

    it("applies led CSS class", () => {
      const { container } = render(<StatusLED />);
      expect(container.querySelector("span")?.className).toMatch(/led/);
    });
  });

  describe("variant", () => {
    it("applies neutral class by default", () => {
      const { container } = render(<StatusLED />);
      expect(container.querySelector("span")?.className).toMatch(/neutral/);
    });

    it("applies success class", () => {
      const { container } = render(<StatusLED variant="success" />);
      expect(container.querySelector("span")?.className).toMatch(/success/);
    });

    it("applies warning class", () => {
      const { container } = render(<StatusLED variant="warning" />);
      expect(container.querySelector("span")?.className).toMatch(/warning/);
    });

    it("applies danger class", () => {
      const { container } = render(<StatusLED variant="danger" />);
      expect(container.querySelector("span")?.className).toMatch(/danger/);
    });

    it("applies accent class", () => {
      const { container } = render(<StatusLED variant="accent" />);
      expect(container.querySelector("span")?.className).toMatch(/accent/);
    });

    it("applies off class", () => {
      const { container } = render(<StatusLED variant="off" />);
      expect(container.querySelector("span")?.className).toMatch(/off/);
    });
  });

  describe("size", () => {
    it("applies md class by default", () => {
      const { container } = render(<StatusLED />);
      expect(container.querySelector("span")?.className).toMatch(/md/);
    });

    it("applies xs class", () => {
      const { container } = render(<StatusLED size="xs" />);
      expect(container.querySelector("span")?.className).toMatch(/xs/);
    });

    it("applies lg class", () => {
      const { container } = render(<StatusLED size="lg" />);
      expect(container.querySelector("span")?.className).toMatch(/lg/);
    });

    it("applies custom numeric size as inline style", () => {
      const { container } = render(<StatusLED size={24} />);
      const el = container.querySelector("span") as HTMLElement;
      expect(el.style.width).toBe("24px");
      expect(el.style.height).toBe("24px");
    });
  });

  describe("pulse", () => {
    it("does not apply pulse class by default", () => {
      const { container } = render(<StatusLED />);
      expect(container.querySelector("span")?.className).not.toMatch(/pulse/);
    });

    it("applies pulse class when pulse=true", () => {
      const { container } = render(<StatusLED pulse />);
      expect(container.querySelector("span")?.className).toMatch(/pulse/);
    });
  });

  describe("label / aria", () => {
    it("uses role=presentation when no label", () => {
      const { container } = render(<StatusLED />);
      expect(container.querySelector("[role='presentation']")).toBeInTheDocument();
    });

    it("uses role=img when label is provided", () => {
      render(<StatusLED label="Online" />);
      expect(screen.getByRole("img", { name: "Online" })).toBeInTheDocument();
    });

    it("has aria-hidden=true when no label", () => {
      const { container } = render(<StatusLED />);
      expect(container.querySelector("span")).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("className and ref", () => {
    it("forwards custom className", () => {
      const { container } = render(<StatusLED className="my-led" />);
      expect(container.querySelector("span")?.className).toMatch(/my-led/);
    });

    it("forwards ref to the span element", () => {
      const ref = { current: null as HTMLSpanElement | null };
      render(<StatusLED ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });
  });
});
