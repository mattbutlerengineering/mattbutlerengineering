import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  describe("dismiss focus", () => {
    it("moves focus to the next banner's dismiss button after Enter", async () => {
      const user = userEvent.setup();
      render(
        <>
          <Banner dismissible>First strip</Banner>
          <Banner dismissible>Second strip</Banner>
        </>
      );
      const [first, second] = screen.getAllByRole("button", { name: "Dismiss" });
      first!.focus();
      await user.keyboard("{Enter}");

      expect(document.activeElement).not.toBe(document.body);
      expect(second).toHaveFocus();
      await waitFor(() => expect(screen.queryByText("First strip")).not.toBeInTheDocument());
      expect(second).toHaveFocus();
      expect(screen.getByText("Second strip")).toBeInTheDocument();
    });

    it("moves focus to the next control after a click on Dismiss", async () => {
      const user = userEvent.setup();
      render(
        <>
          <Banner dismissible action={<button type="button">Review</button>}>
            Closable strip
          </Banner>
          <button type="button">Next</button>
        </>
      );
      await user.click(screen.getByRole("button", { name: "Dismiss" }));

      const next = screen.getByRole("button", { name: "Next" });
      expect(document.activeElement).not.toBe(document.body);
      expect(next).toHaveFocus();
      expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
    });

    it("moves focus to the previous control when nothing follows the banner", async () => {
      const user = userEvent.setup();
      render(
        <>
          <button type="button">Previous</button>
          <Banner dismissible>Only strip</Banner>
        </>
      );
      screen.getByRole("button", { name: "Dismiss" }).focus();
      await user.keyboard("{Enter}");

      expect(screen.getByRole("button", { name: "Previous" })).toHaveFocus();
      expect(document.activeElement).not.toBe(document.body);
    });

    it("leaves focus alone when the banner is dismissed from outside", async () => {
      render(
        <>
          <Banner dismissible>Stays focused elsewhere</Banner>
          <button type="button">Elsewhere</button>
        </>
      );
      const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
      elsewhere.focus();
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

      await waitFor(() =>
        expect(screen.queryByText("Stays focused elsewhere")).not.toBeInTheDocument()
      );
      expect(elsewhere).toHaveFocus();
    });
  });
});
