import { render, screen } from "@testing-library/react";
import { Stat } from "./Stat";

describe("Stat", () => {
  describe("rendering", () => {
    it("renders the label", () => {
      render(<Stat label="Lap Time" value="1:25.410" />);
      expect(screen.getByText("Lap Time")).toBeInTheDocument();
    });

    it("renders the value", () => {
      render(<Stat label="Lap Time" value="1:25.410" />);
      expect(screen.getByText("1:25.410")).toBeInTheDocument();
    });

    it("renders ReactNode value", () => {
      render(<Stat label="Status" value={<strong>Active</strong>} />);
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("renders delta text when provided", () => {
      render(<Stat label="Lap Time" value="1:25.410" delta="-0.342" />);
      expect(screen.getByText("-0.342")).toBeInTheDocument();
    });

    it("does not render delta when absent", () => {
      render(<Stat label="Lap Time" value="1:25.410" />);
      expect(screen.queryByText(/-/)).not.toBeInTheDocument();
    });
  });

  describe("trend", () => {
    it("applies trendUp class when trend=up", () => {
      const { container } = render(<Stat label="Speed" value="320" delta="+10" trend="up" />);
      // The delta span has the trend class
      const delta = container.querySelector("[class*='delta']");
      expect(delta?.className).toMatch(/trendUp/);
    });

    it("applies trendDown class when trend=down", () => {
      const { container } = render(
        <Stat label="Lap Time" value="1:25" delta="-0.3" trend="down" />
      );
      const delta = container.querySelector("[class*='delta']");
      expect(delta?.className).toMatch(/trendDown/);
    });

    it("applies trendNeutral class when trend=neutral (default)", () => {
      const { container } = render(<Stat label="Points" value="400" delta="0" trend="neutral" />);
      const delta = container.querySelector("[class*='delta']");
      expect(delta?.className).toMatch(/trendNeutral/);
    });

    it("renders trend arrow svg for up trend", () => {
      const { container } = render(<Stat label="Speed" value="320" delta="+10" trend="up" />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("renders trend arrow svg for down trend", () => {
      const { container } = render(
        <Stat label="Lap Time" value="1:25" delta="-0.3" trend="down" />
      );
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("does not render trend arrow for neutral trend", () => {
      const { container } = render(<Stat label="Points" value="400" delta="0" trend="neutral" />);
      expect(container.querySelector("svg")).not.toBeInTheDocument();
    });
  });

  describe("size", () => {
    it("does not apply size-specific class for md (default)", () => {
      const { container } = render(<Stat label="L" value="V" size="md" />);
      expect(container.firstElementChild?.className).not.toMatch(/\bsm\b/);
      expect(container.firstElementChild?.className).not.toMatch(/\blg\b/);
    });

    it("applies sm class when size=sm", () => {
      const { container } = render(<Stat label="L" value="V" size="sm" />);
      expect(container.firstElementChild?.className).toMatch(/sm/);
    });

    it("applies lg class when size=lg", () => {
      const { container } = render(<Stat label="L" value="V" size="lg" />);
      expect(container.firstElementChild?.className).toMatch(/lg/);
    });
  });

  describe("aria", () => {
    it("has role=group with aria-label equal to label", () => {
      render(<Stat label="Lap Time" value="1:25.410" />);
      expect(screen.getByRole("group", { name: "Lap Time" })).toBeInTheDocument();
    });
  });

  describe("className and ref", () => {
    it("forwards custom className", () => {
      const { container } = render(<Stat label="L" value="V" className="my-stat" />);
      expect(container.firstElementChild?.className).toMatch(/my-stat/);
    });

    it("forwards ref to the div element", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Stat label="L" value="V" ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
