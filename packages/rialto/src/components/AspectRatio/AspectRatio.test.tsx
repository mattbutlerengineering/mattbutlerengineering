import { render } from "@testing-library/react";
import { AspectRatio } from "./AspectRatio";

describe("AspectRatio", () => {
  describe("rendering", () => {
    it("renders children", () => {
      const { container } = render(
        <AspectRatio>
          <img src="/hero.jpg" alt="Hero" />
        </AspectRatio>
      );
      expect(container.querySelector("img")).toBeInTheDocument();
    });

    it("renders outer wrapper div", () => {
      const { container } = render(<AspectRatio>content</AspectRatio>);
      expect(container.querySelector("div")).toBeInTheDocument();
    });

    it("sets --ratio CSS custom property to default 16/9", () => {
      const { container } = render(<AspectRatio>content</AspectRatio>);
      const root = container.firstElementChild as HTMLElement;
      expect(root.style.getPropertyValue("--ratio")).toBe(String(16 / 9));
    });

    it("sets --ratio CSS custom property to custom ratio", () => {
      const { container } = render(<AspectRatio ratio={4 / 3}>content</AspectRatio>);
      const root = container.firstElementChild as HTMLElement;
      expect(root.style.getPropertyValue("--ratio")).toBe(String(4 / 3));
    });

    it("applies custom className", () => {
      const { container } = render(<AspectRatio className="custom">content</AspectRatio>);
      expect(container.firstElementChild?.className).toMatch(/custom/);
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the outer div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<AspectRatio ref={ref}>content</AspectRatio>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("square ratio", () => {
    it("accepts ratio=1 for square", () => {
      const { container } = render(<AspectRatio ratio={1}>content</AspectRatio>);
      const root = container.firstElementChild as HTMLElement;
      expect(root.style.getPropertyValue("--ratio")).toBe("1");
    });
  });
});
