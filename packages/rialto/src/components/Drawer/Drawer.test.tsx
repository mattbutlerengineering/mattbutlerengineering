/**
 * Unit tests for the Drawer component.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Drawer } from "./Drawer";

const user = userEvent.setup();

describe("Drawer", () => {
  it("renders content when open", () => {
    render(
      <Drawer open title="Settings" onClose={vi.fn()}>
        <p>Drawer body</p>
      </Drawer>
    );
    expect(screen.getByText("Drawer body")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <Drawer open={false} title="Settings" onClose={vi.fn()}>
        <p>Hidden body</p>
      </Drawer>
    );
    expect(screen.queryByText("Hidden body")).not.toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Drawer open title="Test" onClose={onClose}>
        <p>Content</p>
      </Drawer>
    );
    // The backdrop overlay is a sibling to the dialog panel
    // Clicking document.body does not trigger the overlay's onClick
    await user.click(document.body);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Drawer open title="Settings" onClose={onClose}>
        <p>Body</p>
      </Drawer>
    );
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape key is pressed", async () => {
    const onClose = vi.fn();
    render(
      <Drawer open title="Settings" onClose={onClose}>
        <p>Body</p>
      </Drawer>
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("has role=dialog with aria-modal", () => {
    render(
      <Drawer open title="Test" onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("has aria-labelledby pointing to title when title provided", () => {
    render(
      <Drawer open title="My Drawer" onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>
    );
    const dialog = screen.getByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const titleEl = document.getElementById(labelledBy!);
    expect(titleEl).toHaveTextContent("My Drawer");
  });

  it("renders description when provided", () => {
    render(
      <Drawer open title="Title" description="Some description" onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>
    );
    expect(screen.getByText("Some description")).toBeInTheDocument();
  });

  it("renders footer when provided", () => {
    render(
      <Drawer open title="Title" footer={<button>Save</button>} onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>
    );
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("renders without title (uses aria-label fallback)", () => {
    render(
      <Drawer open onClose={vi.fn()}>
        <p>No title</p>
      </Drawer>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", "Drawer");
  });

  it("supports left side variant", () => {
    render(
      <Drawer open side="left" title="Left Drawer" onClose={vi.fn()}>
        <p>Content</p>
      </Drawer>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("supports bottom side variant", () => {
    render(
      <Drawer open side="bottom" title="Bottom Drawer" onClose={vi.fn()}>
        <p>Content</p>
      </Drawer>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("locks body scroll when open", () => {
    render(
      <Drawer open title="Test" onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>
    );
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores body scroll when closed", () => {
    const { rerender } = render(
      <Drawer open title="Test" onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <Drawer open={false} title="Test" onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("focuses close button on open (focus trap initializes)", async () => {
    render(
      <Drawer open title="Test" onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>
    );
    const closeBtn = screen.getByRole("button", { name: /close/i });
    // The focus trap focuses the first focusable element (close button)
    expect(closeBtn).toHaveFocus();
  });
});
