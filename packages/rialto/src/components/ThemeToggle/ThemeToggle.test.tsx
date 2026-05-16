import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  describe("rendering", () => {
    it("renders a button element", () => {
      render(<ThemeToggle theme="light" onToggle={() => {}} />);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("has aria-label indicating switch to dark mode when in light theme", () => {
      render(<ThemeToggle theme="light" onToggle={() => {}} />);
      expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Switch to dark mode");
    });

    it("has aria-label indicating switch to light mode when in dark theme", () => {
      render(<ThemeToggle theme="dark" onToggle={() => {}} />);
      expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Switch to light mode");
    });

    it("renders an svg icon", () => {
      const { container } = render(<ThemeToggle theme="light" onToggle={() => {}} />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("has type=button", () => {
      render(<ThemeToggle theme="light" onToggle={() => {}} />);
      expect(screen.getByRole("button")).toHaveAttribute("type", "button");
    });
  });

  describe("click behavior", () => {
    it("calls onToggle when clicked in light mode", async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      render(<ThemeToggle theme="light" onToggle={onToggle} />);
      await user.click(screen.getByRole("button"));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("calls onToggle when clicked in dark mode", async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      render(<ThemeToggle theme="dark" onToggle={onToggle} />);
      await user.click(screen.getByRole("button"));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the button element", () => {
      const ref = { current: null as HTMLButtonElement | null };
      render(<ThemeToggle theme="light" onToggle={() => {}} ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });

  describe("icon path differences", () => {
    it("renders circle element in dark mode (sun icon has a center circle)", () => {
      const { container } = render(<ThemeToggle theme="dark" onToggle={() => {}} />);
      // Sun icon uses a circle element for the center
      expect(container.querySelector("circle")).toBeInTheDocument();
    });

    it("renders path element in light mode (moon icon uses a path)", () => {
      const { container } = render(<ThemeToggle theme="light" onToggle={() => {}} />);
      // Moon icon uses only a path, no circle
      expect(container.querySelector("path")).toBeInTheDocument();
    });

    it("renders line elements only in dark mode (sun icon has rays)", () => {
      const { container: darkContainer } = render(<ThemeToggle theme="dark" onToggle={() => {}} />);
      const { container: lightContainer } = render(
        <ThemeToggle theme="light" onToggle={() => {}} />
      );
      // Sun icon has line elements for rays; moon does not
      expect(darkContainer.querySelectorAll("line").length).toBeGreaterThan(0);
      expect(lightContainer.querySelectorAll("line").length).toBe(0);
    });
  });
});
