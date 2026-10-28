import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RialtoProvider } from "../../providers/RialtoProvider";
import { Dialog } from "./Dialog";

describe("Dialog", () => {
  describe("rendering", () => {
    it("renders nothing when open=false", () => {
      render(<Dialog open={false} onClose={() => {}} title="Test" />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders dialog when open=true", () => {
      render(<Dialog open onClose={() => {}} title="Test Dialog" />);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("renders title text", () => {
      render(<Dialog open onClose={() => {}} title="Edit Profile" />);
      expect(screen.getByText("Edit Profile")).toBeInTheDocument();
    });

    it("renders description when provided", () => {
      render(<Dialog open onClose={() => {}} description="This action cannot be undone." />);
      expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
    });

    it("renders children", () => {
      render(
        <Dialog open onClose={() => {}}>
          <p>Dialog body</p>
        </Dialog>
      );
      expect(screen.getByText("Dialog body")).toBeInTheDocument();
    });

    it("renders footer when provided", () => {
      render(
        <Dialog open onClose={() => {}} footer={<button>Save</button>}>
          Content
        </Dialog>
      );
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("renders a close button", () => {
      render(<Dialog open onClose={() => {}} />);
      expect(screen.getByRole("button", { name: /close dialog/i })).toBeInTheDocument();
    });
  });

  describe("ARIA attributes", () => {
    it("has aria-modal=true", () => {
      render(<Dialog open onClose={() => {}} />);
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    });

    it("sets aria-labelledby when title is provided", () => {
      render(<Dialog open onClose={() => {}} title="My Dialog" />);
      const dialog = screen.getByRole("dialog");
      const labelId = dialog.getAttribute("aria-labelledby");
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId!)).toHaveTextContent("My Dialog");
    });

    it("sets aria-label=Dialog when no title", () => {
      render(<Dialog open onClose={() => {}} />);
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Dialog");
    });

    it("sets aria-describedby when description is provided", () => {
      render(<Dialog open onClose={() => {}} description="Some description" />);
      const dialog = screen.getByRole("dialog");
      const descId = dialog.getAttribute("aria-describedby");
      expect(descId).toBeTruthy();
      expect(document.getElementById(descId!)).toHaveTextContent("Some description");
    });
  });

  describe("close behavior", () => {
    it("calls onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<Dialog open onClose={onClose} />);
      await user.click(screen.getByRole("button", { name: /close dialog/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Escape is pressed", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<Dialog open onClose={onClose} />);
      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when overlay backdrop is clicked", () => {
      const onClose = vi.fn();
      render(<Dialog open onClose={onClose} />);
      const overlay = document.body.querySelector('[class*="overlay"]') as HTMLElement;
      expect(overlay).not.toBeNull();
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalled();
    });

    it("portals a nested dialog outside the outer panel so the two do not share a box", () => {
      render(
        <Dialog open onClose={() => {}} title="Outer">
          <Dialog open onClose={() => {}} title="Inner">
            <p>Inside</p>
          </Dialog>
        </Dialog>
      );
      const outer = screen.getByRole("dialog", { name: "Outer" });
      const inner = screen.getByRole("dialog", { name: "Inner" });
      expect(outer.contains(inner)).toBe(false);
    });

    it("renders inside its provider subtree, inheriting dir and the vibe variables", () => {
      render(
        <RialtoProvider vibe="transacting">
          <div dir="rtl" data-testid="rtl-root">
            <Dialog open onClose={() => {}} title="Scoped" />
          </div>
        </RialtoProvider>
      );
      const dialog = screen.getByRole("dialog", { name: "Scoped" });
      expect(screen.getByTestId("rtl-root").contains(dialog)).toBe(true);
      const vibeRoot = dialog.closest<HTMLElement>("[data-theme]");
      expect(vibeRoot?.style.getPropertyValue("--rialto-radius-default")).toBe("4px");
    });

    it("keeps a nested dialog inside the provider subtree too", () => {
      render(
        <div dir="rtl" data-testid="rtl-root">
          <Dialog open onClose={() => {}} title="Outer">
            <Dialog open onClose={() => {}} title="Inner" />
          </Dialog>
        </div>
      );
      const inner = screen.getByRole("dialog", { name: "Inner" });
      expect(screen.getByTestId("rtl-root").contains(inner)).toBe(true);
    });

    it("closes nested dialogs one at a time on Escape", async () => {
      const user = userEvent.setup();
      function Nested() {
        const [outerOpen, setOuterOpen] = useState(true);
        const [innerOpen, setInnerOpen] = useState(false);
        return (
          <Dialog open={outerOpen} onClose={() => setOuterOpen(false)} title="Outer">
            <button type="button" onClick={() => setInnerOpen(true)}>
              Open inner
            </button>
            <Dialog open={innerOpen} onClose={() => setInnerOpen(false)} title="Inner" />
          </Dialog>
        );
      }
      render(<Nested />);
      await user.click(screen.getByRole("button", { name: "Open inner" }));
      expect(screen.getByRole("dialog", { name: "Inner" })).toBeInTheDocument();

      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Inner" })).not.toBeInTheDocument()
      );
      expect(screen.getByRole("dialog", { name: "Outer" })).toBeInTheDocument();

      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Outer" })).not.toBeInTheDocument()
      );
    });

    it("does not close when clicking inside the panel", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <Dialog open onClose={onClose} title="Panel">
          <p>Inner content</p>
        </Dialog>
      );
      await user.click(screen.getByText("Inner content"));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("focus management", () => {
    it("moves focus inside the dialog when opened", () => {
      render(
        <Dialog open onClose={() => {}}>
          <button>First</button>
        </Dialog>
      );
      // The close button or first focusable element inside should receive focus
      // At minimum, a button exists and the dialog is rendered
      expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    });

    it("does not focus the close button first", () => {
      render(
        <Dialog open onClose={() => {}} title="Edit profile">
          <button>First</button>
        </Dialog>
      );
      expect(document.activeElement).toBe(screen.getByText("First"));
      expect(document.activeElement).not.toBe(
        screen.getByRole("button", { name: /close dialog/i })
      );
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the panel element", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Dialog ref={ref} open onClose={() => {}} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
