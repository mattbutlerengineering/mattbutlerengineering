import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  describe("rendering", () => {
    it("renders nothing when open=false", () => {
      render(
        <ConfirmDialog
          open={false}
          onConfirm={() => {}}
          onCancel={() => {}}
          title="Delete?"
        />
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders dialog when open=true", () => {
      render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={() => {}}
          title="Delete?"
        />
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("renders title", () => {
      render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={() => {}}
          title="Delete item?"
        />
      );
      expect(screen.getByText("Delete item?")).toBeInTheDocument();
    });

    it("renders description when provided", () => {
      render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={() => {}}
          title="Delete?"
          description="This cannot be undone."
        />
      );
      expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    });

    it("renders confirm and cancel buttons with default labels", () => {
      render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={() => {}}
          title="Delete?"
        />
      );
      expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });

    it("renders custom confirm/cancel labels", () => {
      render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={() => {}}
          title="Delete?"
          confirmLabel="Yes, delete"
          cancelLabel="No, keep it"
        />
      );
      expect(screen.getByRole("button", { name: "Yes, delete" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "No, keep it" })).toBeInTheDocument();
    });
  });

  describe("callbacks", () => {
    it("calls onConfirm when confirm button is clicked", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(
        <ConfirmDialog
          open
          onConfirm={onConfirm}
          onCancel={() => {}}
          title="Delete?"
        />
      );
      await user.click(screen.getByRole("button", { name: "Confirm" }));
      expect(onConfirm).toHaveBeenCalledOnce();
    });

    it("calls onCancel when cancel button is clicked", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={onCancel}
          title="Delete?"
        />
      );
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it("calls onCancel when Escape is pressed", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={onCancel}
          title="Delete?"
        />
      );
      await user.keyboard("{Escape}");
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });

  describe("variants", () => {
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
          title="Delete everything?"
          variant="destructive"
        />
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("passes axe for default variant", async () => {
      const { container } = render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={() => {}}
          title="Confirm?"
        />
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });

    it("passes axe for destructive variant", async () => {
      const { container } = render(
        <ConfirmDialog
          open
          onConfirm={() => {}}
          onCancel={() => {}}
          title="Delete?"
          variant="destructive"
        />
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
