import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Banner } from "./Banner";

describe("Banner", () => {
  describe("rendering", () => {
    it("renders children", () => {
      render(<Banner>System update available</Banner>);
      expect(screen.getByText("System update available")).toBeInTheDocument();
    });

    it("uses role=status for info variant (default)", () => {
      render(<Banner>Info message</Banner>);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("uses role=alert for error variant", () => {
      render(<Banner variant="error">Error occurred</Banner>);
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("uses role=alert for warning variant", () => {
      render(<Banner variant="warning">Warning</Banner>);
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("uses role=status for accent variant", () => {
      render(<Banner variant="accent">Feature announcement</Banner>);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("applies variant class", () => {
      const { container } = render(<Banner variant="warning">Warn</Banner>);
      expect(container.firstElementChild?.className).toMatch(/warning/);
    });

    it("renders action slot when provided", () => {
      render(<Banner action={<button type="button">Update now</button>}>Update available</Banner>);
      expect(screen.getByRole("button", { name: "Update now" })).toBeInTheDocument();
    });

    it("does not render dismiss button by default", () => {
      render(<Banner>Info</Banner>);
      expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
    });

    it("renders dismiss button when dismissible", () => {
      render(<Banner dismissible>Info</Banner>);
      expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
    });
  });

  describe("dismiss behavior", () => {
    it("hides banner after dismiss click", async () => {
      const user = userEvent.setup();
      render(<Banner dismissible>Dismissible</Banner>);
      await user.click(screen.getByRole("button", { name: /dismiss/i }));
      expect(screen.queryByText("Dismissible")).not.toBeInTheDocument();
    });

    it("calls onDismiss callback when dismissed", async () => {
      const user = userEvent.setup();
      const onDismiss = vi.fn();
      render(
        <Banner dismissible onDismiss={onDismiss}>
          Info
        </Banner>
      );
      await user.click(screen.getByRole("button", { name: /dismiss/i }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe("className forwarding", () => {
    it("applies custom className", () => {
      const { container } = render(<Banner className="my-banner">Info</Banner>);
      expect(container.firstElementChild?.className).toMatch(/my-banner/);
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the underlying div element", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Banner ref={ref}>Info</Banner>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("icon rendering", () => {
    it("renders an icon for each variant", () => {
      const variants = ["info", "warning", "error", "accent"] as const;
      for (const variant of variants) {
        const { container, unmount } = render(<Banner variant={variant}>Text</Banner>);
        expect(container.querySelector('[class*="icon"]')).toBeInTheDocument();
        unmount();
      }
    });
  });

  describe("onDismiss without callback", () => {
    it("does not throw when dismissible is true but onDismiss is not provided", async () => {
      const user = userEvent.setup();
      render(<Banner dismissible>Dismiss me</Banner>);
      await user.click(screen.getByRole("button", { name: /dismiss/i }));
      expect(screen.queryByText("Dismiss me")).not.toBeInTheDocument();
    });
  });
});
