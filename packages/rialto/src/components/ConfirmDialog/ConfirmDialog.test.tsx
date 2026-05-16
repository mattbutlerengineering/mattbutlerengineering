import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  describe("rendering", () => {
    it("renders nothing when open=false", () => {
      render(
        <ConfirmDialog open={false} onConfirm={() => {}} onCancel={() => {}} title="Delete item?" />
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders dialog when open=true", () => {
      render(<ConfirmDialog open onConfirm={() => {}} onCancel={() => {}} title="Delete item?" />);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("renders title text", () => {
      render(<ConfirmDialog open onConfirm={() => {}} onCancel={() => {}} title="Delete item?" />);
      expect(screen.getByText("Delete item?")).toBeInTheDocument();
    });

    it("renders description when provided", () => {
      render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={() => {}}
          title="Delete?"
          description="This action cannot be undone."
        />
      );
      expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
    });

    it("renders confirm and cancel buttons with default labels", () => {
      render(<ConfirmDialog open onConfirm={() => {}} onCancel={() => {}} title="Confirm?" />);
      expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    });

    it("renders custom button labels", () => {
      render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={() => {}}
          title="Delete?"
          confirmLabel="Yes, delete"
          cancelLabel="No, keep"
        />
      );
      expect(screen.getByRole("button", { name: /yes, delete/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /no, keep/i })).toBeInTheDocument();
    });
  });

  describe("callbacks", () => {
    it("calls onConfirm when confirm button is clicked", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(<ConfirmDialog open onConfirm={onConfirm} onCancel={() => {}} title="Confirm?" />);
      await user.click(screen.getByRole("button", { name: /confirm/i }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("calls onCancel when cancel button is clicked", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      render(<ConfirmDialog open onConfirm={() => {}} onCancel={onCancel} title="Confirm?" />);
      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("calls onCancel when Escape is pressed", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      render(<ConfirmDialog open onConfirm={() => {}} onCancel={onCancel} title="Confirm?" />);
      await user.keyboard("{Escape}");
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("variant", () => {
    it("renders default variant", () => {
      render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={() => {}}
          title="Confirm?"
          variant="default"
        />
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("renders destructive variant", () => {
      render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={() => {}}
          title="Delete forever?"
          variant="destructive"
        />
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the panel element", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(
        <ConfirmDialog ref={ref} open onConfirm={() => {}} onCancel={() => {}} title="Test" />
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("accessibility", () => {
    it("has no a11y violations", async () => {
      const { container } = render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={() => {}}
          title="Confirm action?"
          description="Are you sure you want to proceed?"
        />
      );
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });
  });
});
