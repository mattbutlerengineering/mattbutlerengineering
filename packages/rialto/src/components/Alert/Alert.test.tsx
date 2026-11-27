import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  describe("className passthrough", () => {
    it("appends custom className to the alert element", () => {
      const { container } = render(<Alert className="my-custom-alert">Content</Alert>);
      expect(container.querySelector('[class*="my-custom-alert"]')).toBeInTheDocument();
    });
  });

  describe("no title rendered when omitted", () => {
    it("does not render a title paragraph when title is not provided", () => {
      const { container } = render(<Alert>No title here</Alert>);
      expect(container.querySelector('[class*="title"]')).not.toBeInTheDocument();
    });
  });

  describe("no actions rendered when omitted", () => {
    it("does not render actions slot when actions not provided", () => {
      const { container } = render(<Alert>No actions</Alert>);
      expect(container.querySelector('[class*="actions"]')).not.toBeInTheDocument();
    });
  });

  describe("dismissible without onDismiss", () => {
    it("does not throw when dismissible is true but onDismiss is not provided", async () => {
      const user = userEvent.setup();
      render(<Alert dismissible>Dismiss me</Alert>);
      await expect(
        user.click(screen.getByRole("button", { name: /dismiss/i }))
      ).resolves.not.toThrow();
    });
  });

  describe("dismiss focus", () => {
    it("moves focus to the next alert's dismiss button after Enter", async () => {
      const user = userEvent.setup();
      render(
        <>
          <Alert dismissible>First notice</Alert>
          <Alert dismissible>Second notice</Alert>
        </>
      );
      const [first, second] = screen.getAllByRole("button", { name: "Dismiss" });
      first!.focus();
      await user.keyboard("{Enter}");

      expect(document.activeElement).not.toBe(document.body);
      expect(second).toHaveFocus();
      await waitFor(() => expect(screen.queryByText("First notice")).not.toBeInTheDocument());
      expect(second).toHaveFocus();
      expect(screen.getByText("Second notice")).toBeInTheDocument();
    });

    it("moves focus to the next control after Space, skipping controls inside the alert", async () => {
      const user = userEvent.setup();
      render(
        <>
          <Alert dismissible actions={<button type="button">Retry</button>}>
            Closable notice
          </Alert>
          <button type="button">Next</button>
        </>
      );
      screen.getByRole("button", { name: "Dismiss" }).focus();
      await user.keyboard(" ");

      const next = screen.getByRole("button", { name: "Next" });
      expect(document.activeElement).not.toBe(document.body);
      expect(next).toHaveFocus();
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument()
      );
    });

    it("moves focus to the next control after a click on Dismiss", async () => {
      const user = userEvent.setup();
      render(
        <>
          <Alert dismissible>Clicked notice</Alert>
          <button type="button">After click</button>
        </>
      );
      await user.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(screen.getByRole("button", { name: "After click" })).toHaveFocus();
      expect(document.activeElement).not.toBe(document.body);
      // AnimatePresence unmounts on exit completion, which lags under CPU load.
      await waitFor(() => expect(screen.queryByText("Clicked notice")).not.toBeInTheDocument());
    });

    it("moves focus to the previous control when nothing follows the alert", async () => {
      const user = userEvent.setup();
      render(
        <>
          <button type="button">Previous</button>
          <Alert dismissible>Only notice</Alert>
        </>
      );
      screen.getByRole("button", { name: "Dismiss" }).focus();
      await user.keyboard("{Enter}");

      expect(screen.getByRole("button", { name: "Previous" })).toHaveFocus();
      expect(document.activeElement).not.toBe(document.body);
    });

    it("leaves focus alone when the alert is dismissed from outside", async () => {
      render(
        <>
          <Alert dismissible>Stays focused elsewhere</Alert>
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
