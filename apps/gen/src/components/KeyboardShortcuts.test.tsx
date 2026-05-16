import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeyboardShortcuts, HelpButton } from "./KeyboardShortcuts.js";

vi.mock("./KeyboardShortcuts.module.css", () => ({
  default: {
    overlay: "overlay",
    panel: "panel",
    header: "header",
    title: "title",
    closeButton: "closeButton",
    body: "body",
    sectionTitle: "sectionTitle",
    shortcutList: "shortcutList",
    row: "row",
    label: "label",
    keys: "keys",
    footer: "footer",
    footerText: "footerText",
    searchMatch: "searchMatch",
    helpButton: "helpButton",
  },
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Kbd: ({ children }: { children: React.ReactNode }) => (
    <kbd data-testid="kbd">{children}</kbd>
  ),
  Shortcut: ({ keys }: { keys: string[] }) => (
    <span data-testid="shortcut">{keys.join("+")}</span>
  ),
}));

describe("KeyboardShortcuts", () => {
  it("should not render when open is false", () => {
    const { container } = render(
      <KeyboardShortcuts open={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("should render when open is true", () => {
    render(<KeyboardShortcuts open={true} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Keyboard Shortcuts")).toBeDefined();
  });

  it("should call onClose when escape key is pressed", () => {
    const onClose = vi.fn();
    render(<KeyboardShortcuts open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should call onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<KeyboardShortcuts open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should render all shortcut sections", () => {
    render(<KeyboardShortcuts open={true} onClose={() => {}} />);
    expect(screen.getByText("Navigation")).toBeDefined();
    expect(screen.getByText("Editing")).toBeDefined();
    expect(screen.getByText("Panels")).toBeDefined();
    expect(screen.getByText("General")).toBeDefined();
  });

  it("should render shortcut items with keyboard labels", () => {
    render(<KeyboardShortcuts open={true} onClose={() => {}} />);
    expect(screen.getByText("Command palette")).toBeDefined();
    expect(screen.getByText("Send prompt")).toBeDefined();
  });

  it("should have footer with escape hint", () => {
    render(<KeyboardShortcuts open={true} onClose={() => {}} />);
    const kbdElements = screen.getAllByTestId("kbd");
    expect(kbdElements.length).toBeGreaterThan(0);
  });
});

describe("HelpButton", () => {
  it("should render a button with question mark", () => {
    render(<HelpButton onClick={() => {}} />);
    const button = screen.getByRole("button", { name: /keyboard shortcuts/i });
    expect(button).toBeDefined();
    expect(button.textContent).toBe("?");
  });

  it("should call onClick when clicked", () => {
    const onClick = vi.fn();
    render(<HelpButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: /keyboard shortcuts/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});