import { render, screen } from "@testing-library/react";
import { Skeleton, SkeletonGroup } from "./Skeleton";

describe("Skeleton", () => {
  describe("rendering", () => {
    it("renders a single div by default", () => {
      const { container } = render(<Skeleton />);
      expect(container.querySelector("div")).toBeInTheDocument();
    });

    it("applies skeleton CSS class", () => {
      const { container } = render(<Skeleton />);
      expect(container.firstElementChild?.className).toMatch(/skeleton/);
    });

    it("has aria-hidden=true", () => {
      const { container } = render(<Skeleton />);
      // Single line renders the outer div with aria-hidden
      expect(container.querySelector("[aria-hidden='true']")).toBeInTheDocument();
    });
  });

  describe("variant", () => {
    it("applies rect class by default", () => {
      const { container } = render(<Skeleton variant="rect" />);
      expect(container.firstElementChild?.className).toMatch(/rect/);
    });

    it("applies circle class", () => {
      const { container } = render(<Skeleton variant="circle" />);
      expect(container.firstElementChild?.className).toMatch(/circle/);
    });

    it("applies card class", () => {
      const { container } = render(<Skeleton variant="card" />);
      expect(container.firstElementChild?.className).toMatch(/card/);
    });

    it("applies text class", () => {
      const { container } = render(<Skeleton variant="text" />);
      expect(container.firstElementChild?.className).toMatch(/text/);
    });

    it("applies heading class", () => {
      const { container } = render(<Skeleton variant="heading" />);
      expect(container.firstElementChild?.className).toMatch(/heading/);
    });
  });

  describe("size props", () => {
    it("applies numeric width as px style", () => {
      const { container } = render(<Skeleton width={200} />);
      const el = container.querySelector("[aria-hidden='true']") as HTMLElement;
      expect(el.style.width).toBe("200px");
    });

    it("applies string width directly", () => {
      const { container } = render(<Skeleton width="50%" />);
      const el = container.querySelector("[aria-hidden='true']") as HTMLElement;
      expect(el.style.width).toBe("50%");
    });

    it("applies numeric height as px style", () => {
      const { container } = render(<Skeleton height={100} />);
      const el = container.querySelector("[aria-hidden='true']") as HTMLElement;
      expect(el.style.height).toBe("100px");
    });
  });

  describe("multi-line text skeleton", () => {
    it("renders multiple child divs for lines>1 with text variant", () => {
      const { container } = render(<Skeleton variant="text" lines={3} />);
      // Wrapper div + 3 inner divs
      const inner = container.firstElementChild?.querySelectorAll("div");
      expect(inner).toHaveLength(3);
    });

    it("renders multiple child divs for lines>1 with heading variant", () => {
      const { container } = render(<Skeleton variant="heading" lines={2} />);
      const inner = container.firstElementChild?.querySelectorAll("div");
      expect(inner).toHaveLength(2);
    });

    it("last line div has 60% width for natural paragraph look", () => {
      const { container } = render(<Skeleton variant="text" lines={3} />);
      const children = container.firstElementChild?.querySelectorAll("div");
      const last = children?.[2] as HTMLElement;
      expect(last.style.width).toBe("60%");
    });
  });

  describe("circle auto-height", () => {
    it("sets height equal to width for circle when no height given", () => {
      const { container } = render(<Skeleton variant="circle" width={48} />);
      const el = container.firstElementChild as HTMLElement;
      expect(el.style.height).toBe("48px");
    });
  });

  describe("className and ref", () => {
    it("forwards custom className", () => {
      const { container } = render(<Skeleton className="my-skeleton" />);
      // className goes on the single/wrapper element
      expect(container.firstElementChild?.className).toMatch(/my-skeleton/);
    });

    it("forwards ref to the div element", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Skeleton ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});

describe("SkeletonGroup", () => {
  describe("rendering", () => {
    it("renders children", () => {
      render(
        <SkeletonGroup>
          <Skeleton />
        </SkeletonGroup>
      );
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("has role=status and aria-busy=true", () => {
      render(
        <SkeletonGroup>
          <Skeleton />
        </SkeletonGroup>
      );
      const el = screen.getByRole("status");
      expect(el).toHaveAttribute("aria-busy", "true");
      expect(el).toHaveAttribute("aria-label", "Loading content");
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the wrapper div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(
        <SkeletonGroup ref={ref}>
          <Skeleton />
        </SkeletonGroup>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
