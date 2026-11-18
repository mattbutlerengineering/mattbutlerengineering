import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { ToastProvider } from "./Toast";
import { useToast } from "./ToastContext";

// Helper component to trigger toasts in tests
function ToastTrigger({
  title,
  variant,
  description,
  duration,
  action,
}: {
  title: string;
  variant?: "default" | "success" | "error" | "accent";
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}) {
  const { toast } = useToast();
  return (
    <button onClick={() => toast({ title, variant, description, duration, action })}>
      Show Toast
    </button>
  );
}

describe("ToastProvider", () => {
  describe("rendering", () => {
    it("renders children", () => {
      render(
        <ToastProvider>
          <p>App content</p>
        </ToastProvider>
      );
      expect(screen.getByText("App content")).toBeInTheDocument();
    });

    it("renders notification region", () => {
      render(
        <ToastProvider>
          <p>Content</p>
        </ToastProvider>
      );
      expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();
    });

    it("anchors bottom-end by default and top-end on request", () => {
      const { rerender } = render(
        <ToastProvider>
          <p>Content</p>
        </ToastProvider>
      );
      const region = screen.getByRole("region", { name: "Notifications" });
      expect(region).toHaveAttribute("data-placement", "bottom-end");
      rerender(
        <ToastProvider placement="top-end">
          <p>Content</p>
        </ToastProvider>
      );
      expect(region).toHaveAttribute("data-placement", "top-end");
    });
  });

  describe("toast creation", () => {
    it("shows toast when toast() is called", async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger title="File saved!" duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      await waitFor(() => expect(screen.getByText("File saved!")).toBeInTheDocument(), {
        timeout: 3000,
      });
    });

    it("shows toast with description", async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger title="Saved" description="Changes saved successfully." duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      await waitFor(
        () => {
          expect(screen.getByText("Saved")).toBeInTheDocument();
          expect(screen.getByText("Changes saved successfully.")).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it("shows multiple toasts", async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger title="First toast" duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      await waitFor(
        () => {
          expect(screen.getAllByText("First toast")).toHaveLength(2);
        },
        { timeout: 3000 }
      );
    });
  });

  describe("keyboard focus", () => {
    it("names the dismiss control Dismiss notification", async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger title="Saved" duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      expect(
        await screen.findByRole("button", { name: "Dismiss notification" })
      ).toBeInTheDocument();
    });

    it("returns focus to the trigger after keyboard dismiss", async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger title="Telemetry uploaded" variant="success" duration={0} />
        </ToastProvider>
      );
      const trigger = screen.getByRole("button", { name: "Show Toast" });
      trigger.focus();
      await user.keyboard("{Enter}");
      const dismiss = await screen.findByRole("button", { name: /dismiss/i });
      await user.tab();
      expect(dismiss).toHaveFocus();

      await user.keyboard("{Enter}");
      expect(trigger).toHaveFocus();
    });

    it("moves focus to the next toast's dismiss button when others remain", async () => {
      const user = userEvent.setup();
      function ShowTwo() {
        const { toast } = useToast();
        return (
          <button
            type="button"
            onClick={() => {
              toast({ title: "First", duration: 0 });
              toast({ title: "Second", duration: 0 });
            }}
          >
            Show Two
          </button>
        );
      }
      render(
        <ToastProvider>
          <ShowTwo />
        </ToastProvider>
      );
      const trigger = screen.getByRole("button", { name: "Show Two" });
      trigger.focus();
      await user.keyboard("{Enter}");
      const [firstDismiss, secondDismiss] = await screen.findAllByRole("button", {
        name: /dismiss/i,
      });
      await user.tab();
      expect(firstDismiss).toHaveFocus();

      await user.keyboard("{Enter}");
      expect(secondDismiss).toHaveFocus();
      expect(screen.getByText("Second")).toBeInTheDocument();
    });

    it("returns to the previous toast when the last one is dismissed", async () => {
      const user = userEvent.setup();
      function ShowTwo() {
        const { toast } = useToast();
        return (
          <button
            type="button"
            onClick={() => {
              toast({ title: "First", duration: 0 });
              toast({ title: "Second", duration: 0 });
            }}
          >
            Show Two
          </button>
        );
      }
      render(
        <ToastProvider>
          <ShowTwo />
        </ToastProvider>
      );
      const trigger = screen.getByRole("button", { name: "Show Two" });
      await user.click(trigger);
      const [, secondDismiss] = await screen.findAllByRole("button", { name: /dismiss/i });
      secondDismiss!.focus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("button", { name: /dismiss/i })).toHaveFocus();
      expect(screen.getByText("First")).toBeInTheDocument();
    });

    it("moves focus from a polite toast to a later error toast", async () => {
      const user = userEvent.setup();
      function ShowMixed() {
        const { toast } = useToast();
        return (
          <button
            type="button"
            onClick={() => {
              toast({ title: "Saved", variant: "success", duration: 0 });
              toast({ title: "Failed", variant: "error", duration: 0 });
            }}
          >
            Show Mixed
          </button>
        );
      }
      render(
        <ToastProvider>
          <ShowMixed />
        </ToastProvider>
      );
      const trigger = screen.getByRole("button", { name: "Show Mixed" });
      trigger.focus();
      await user.keyboard("{Enter}");
      const [successDismiss, errorDismiss] = await screen.findAllByRole("button", {
        name: /dismiss/i,
      });
      await user.tab();
      expect(successDismiss).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(errorDismiss).toHaveFocus();
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });

    it("leaves focus alone when a toast is dismissed from outside", async () => {
      const user = userEvent.setup();
      render(
        <>
          <ToastProvider>
            <ToastTrigger title="Saved" duration={0} />
          </ToastProvider>
          <button type="button">Elsewhere</button>
        </>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      const dismiss = await screen.findByRole("button", { name: /dismiss/i });
      const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
      elsewhere.focus();
      fireEvent.click(dismiss);
      await waitFor(() => expect(screen.queryByText("Saved")).not.toBeInTheDocument());
      expect(elsewhere).toHaveFocus();
    });
  });

  describe("toast dismissal", () => {
    it("dismisses toast when dismiss button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger title="Dismissible toast" duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      await waitFor(() => expect(screen.getByText("Dismissible toast")).toBeInTheDocument(), {
        timeout: 3000,
      });
      await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
      await waitFor(() => expect(screen.queryByText("Dismissible toast")).not.toBeInTheDocument(), {
        timeout: 3000,
      });
    });
  });

  describe("toast action", () => {
    it("renders an action button and invokes its onClick", async () => {
      const user = userEvent.setup();
      const onUndo = vi.fn();
      render(
        <ToastProvider>
          <ToastTrigger
            title="Driver removed"
            duration={0}
            action={{ label: "Undo", onClick: onUndo }}
          />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      const undoButton = await screen.findByRole("button", { name: "Undo" });
      await user.click(undoButton);
      expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it("dismisses the toast once its action is invoked", async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger
            title="Driver removed"
            duration={0}
            action={{ label: "Undo", onClick: vi.fn() }}
          />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      await user.click(await screen.findByRole("button", { name: "Undo" }));
      await waitFor(() => expect(screen.queryByText("Driver removed")).not.toBeInTheDocument());
    });

    it("renders no action button when none is provided", async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger title="Plain toast" duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      await waitFor(() => expect(screen.getByText("Plain toast")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    });
  });

  describe("useToast hook", () => {
    it("throws when used outside ToastProvider", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => {
        render(<ToastTrigger title="Outside" />);
      }).toThrow("useToast must be used within <ToastProvider>");
      consoleSpy.mockRestore();
    });
  });

  describe("variants", () => {
    it("renders success variant toast", async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger title="Success message" variant="success" duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      await waitFor(() => expect(screen.getByText("Success message")).toBeInTheDocument(), {
        timeout: 3000,
      });
    });

    it("renders error variant toast", async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger title="Error message" variant="error" duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      await waitFor(() => expect(screen.getByText("Error message")).toBeInTheDocument(), {
        timeout: 3000,
      });
    });
  });

  describe("accessibility", () => {
    it("passes axe without any toasts", async () => {
      const { container } = render(
        <ToastProvider>
          <p>Content</p>
        </ToastProvider>
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });

    it("passes axe with a toast visible", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <ToastProvider>
          <ToastTrigger title="Saved!" variant="success" duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      await waitFor(() => expect(screen.getByText("Saved!")).toBeInTheDocument(), {
        timeout: 3000,
      });
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
