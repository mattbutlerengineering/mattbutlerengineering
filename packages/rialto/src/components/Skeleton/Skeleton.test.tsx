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

    it("forwards custom className", () => {
      const { container } = render(
        <SkeletonGroup className="my-group">
          <Skeleton />
        </SkeletonGroup>
      );
      expect(container.firstElementChild?.className).toMatch(/my-group/);
    });

    it("renders multiple skeleton children", () => {
      const { container } = render(
        <SkeletonGroup>
          <Skeleton variant="circle" width={40} />
          <Skeleton variant="text" lines={2} />
        </SkeletonGroup>
      );
      expect(container.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThanOrEqual(2);
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

describe("Skeleton — additional coverage", () => {
  describe("string height", () => {
    it("applies string height directly", () => {
      const { container } = render(<Skeleton height="5rem" />);
      const el = container.querySelector("[aria-hidden='true']") as HTMLElement;
      expect(el.style.height).toBe("5rem");
    });
  });

  describe("circle auto-height with string width", () => {
    it("sets height equal to string width for circle when no height given", () => {
      const { container } = render(<Skeleton variant="circle" width="3rem" />);
      const el = container.firstElementChild as HTMLElement;
      expect(el.style.height).toBe("3rem");
    });

    it("does not override explicit height on circle", () => {
      const { container } = render(<Skeleton variant="circle" width={48} height={60} />);
      const el = container.firstElementChild as HTMLElement;
      // explicit height wins — auto-height condition requires !height
      expect(el.style.height).toBe("60px");
    });
  });

  describe("gap as string", () => {
    it("renders multi-line skeleton with string gap", () => {
      const { container } = render(<Skeleton variant="text" lines={2} gap="1rem" />);
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.style.gap).toBe("1rem");
    });
  });

  describe("lines=1 with text variant renders single div", () => {
    it("renders a single div (not multi-line wrapper) for lines=1", () => {
      const { container } = render(<Skeleton variant="text" lines={1} />);
      // Single element — no wrapper with children
      expect(container.firstElementChild?.tagName).toBe("DIV");
      expect(container.firstElementChild?.querySelectorAll("div")).toHaveLength(0);
    });
  });

  describe("rect variant with explicit dimensions", () => {
    it("applies both width and height", () => {
      const { container } = render(<Skeleton variant="rect" width={100} height={50} />);
      const el = container.firstElementChild as HTMLElement;
      expect(el.style.width).toBe("100px");
      expect(el.style.height).toBe("50px");
    });
  });

  describe("card variant", () => {
    it("renders single card div with card class and aria-hidden", () => {
      const { container } = render(<Skeleton variant="card" width={300} height={180} />);
      expect(container.querySelector("[aria-hidden='true']")).toBeInTheDocument();
      expect(container.firstElementChild?.className).toMatch(/card/);
    });
  });
});
