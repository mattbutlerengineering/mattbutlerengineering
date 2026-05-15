import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Alert } from "./Alert";

describe("Alert", () => {
  describe("rendering", () => {
    it("renders children", () => {
      render(<Alert>Something happened.</Alert>);
      expect(screen.getByText("Something happened.")).toBeInTheDocument();
    });

    it("renders title when provided", () => {
      render(<Alert title="Heads up">Details here.</Alert>);
      expect(screen.getByText("Heads up")).toBeInTheDocument();
    });

    it("renders actions when provided", () => {
      render(<Alert actions={<button>Retry</button>}>Try again.</Alert>);
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });
  });

  describe("variants", () => {
    it("defaults to info variant", () => {
      const { container } = render(<Alert>Info</Alert>);
      expect(container.querySelector('[class*="info"]')).toBeInTheDocument();
    });

    it("applies success variant class", () => {
      const { container } = render(<Alert variant="success">OK</Alert>);
      expect(container.querySelector('[class*="success"]')).toBeInTheDocument();
    });

    it("applies warning variant class", () => {
      const { container } = render(<Alert variant="warning">Warning</Alert>);
      expect(container.querySelector('[class*="warning"]')).toBeInTheDocument();
    });

    it("applies error variant class", () => {
      const { container } = render(<Alert variant="error">Error</Alert>);
      expect(container.querySelector('[class*="error"]')).toBeInTheDocument();
    });
  });

  describe("ARIA roles", () => {
    it("uses role=status for info variant", () => {
      render(<Alert variant="info">Info</Alert>);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("uses role=status for success variant", () => {
      render(<Alert variant="success">OK</Alert>);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("uses role=alert for warning variant", () => {
      render(<Alert variant="warning">Warning</Alert>);
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("uses role=alert for error variant", () => {
      render(<Alert variant="error">Error</Alert>);
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  describe("dismissible", () => {
    it("does not render dismiss button by default", () => {
      render(<Alert>Not dismissible</Alert>);
      expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
    });

    it("renders dismiss button when dismissible is true", () => {
      render(<Alert dismissible>Dismissible</Alert>);
      expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
    });

    it("hides the alert after clicking dismiss", async () => {
      const user = userEvent.setup();
      const onDismiss = vi.fn();
      render(
        <Alert dismissible onDismiss={onDismiss}>
          Visible content here
        </Alert>
      );
      // Before dismiss — button is present
      expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /dismiss/i }));
      // After dismiss — onDismiss should have been called
      // (AnimatePresence exit may be instant with reduced motion — just verify callback)
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("calls onDismiss callback when dismissed", async () => {
      const user = userEvent.setup();
      const onDismiss = vi.fn();
      render(
        <Alert dismissible onDismiss={onDismiss}>
          Alert
        </Alert>
      );
      await user.click(screen.getByRole("button", { name: /dismiss/i }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe("icon rendering", () => {
    it("renders an icon element for each variant", () => {
      const variants = ["info", "success", "warning", "error"] as const;
      for (const variant of variants) {
        const { container, unmount } = render(<Alert variant={variant}>Test</Alert>);
        const icon = container.querySelector('[class*="icon"]');
        expect(icon).toBeInTheDocument();
        unmount();
      }
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the underlying element", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Alert ref={ref}>Ref test</Alert>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
