import { render, screen, waitFor } from "@testing-library/react";
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
}: {
  title: string;
  variant?: "default" | "success" | "error" | "accent";
  description?: string;
  duration?: number;
}) {
  const { toast } = useToast();
  return (
    <button
      onClick={() => toast({ title, variant, description, duration })}
    >
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
      await waitFor(
        () => expect(screen.getByText("File saved!")).toBeInTheDocument(),
        { timeout: 3000 }
      );
    });

    it("shows toast with description", async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger title="Saved" description="Changes saved successfully." duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      await waitFor(() => {
        expect(screen.getByText("Saved")).toBeInTheDocument();
        expect(screen.getByText("Changes saved successfully.")).toBeInTheDocument();
      }, { timeout: 3000 });
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
      await waitFor(() => {
        expect(screen.getAllByText("First toast")).toHaveLength(2);
      }, { timeout: 3000 });
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
      await waitFor(
        () => expect(screen.getByText("Dismissible toast")).toBeInTheDocument(),
        { timeout: 3000 }
      );
      await user.click(screen.getByRole("button", { name: "Dismiss" }));
      await waitFor(
        () => expect(screen.queryByText("Dismissible toast")).not.toBeInTheDocument(),
        { timeout: 3000 }
      );
    });
  });

  describe("useToast hook", () => {
    it("throws when used outside ToastProvider", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
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
      await waitFor(
        () => expect(screen.getByText("Success message")).toBeInTheDocument(),
        { timeout: 3000 }
      );
    });

    it("renders error variant toast", async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastTrigger title="Error message" variant="error" duration={0} />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "Show Toast" }));
      await waitFor(
        () => expect(screen.getByText("Error message")).toBeInTheDocument(),
        { timeout: 3000 }
      );
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
      await waitFor(
        () => expect(screen.getByText("Saved!")).toBeInTheDocument(),
        { timeout: 3000 }
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
