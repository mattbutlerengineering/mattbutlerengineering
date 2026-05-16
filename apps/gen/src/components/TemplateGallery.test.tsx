/* eslint-disable mbe-local/prefer-rialto-components */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplateGallery } from "./TemplateGallery.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Badge: ({
    children,
    variant,
    size,
  }: {
    children?: React.ReactNode;
    variant?: string;
    size?: string;
  }) => (
    <span data-testid="badge" data-variant={variant} data-size={size}>
      {children}
    </span>
  ),
  Shortcut: ({ keys }: { keys: string[] }) => (
    <span data-testid="shortcut">{keys.join("+")}</span>
  ),
}));

vi.mock("./TemplateGallery.module.css", () => ({
  default: {
    overlay: "overlay",
    panel: "panel",
    header: "header",
    headerLeft: "headerLeft",
    title: "title",
    shortcutHint: "shortcutHint",
    closeButton: "closeButton",
    body: "body",
    sidebar: "sidebar",
    categoryButton: "categoryButton",
    categoryButtonActive: "categoryButtonActive",
    categoryCount: "categoryCount",
    main: "main",
    searchBar: "searchBar",
    searchInput: "searchInput",
    templateGrid: "templateGrid",
    card: "card",
    cardEnter: "cardEnter",
    cardTitle: "cardTitle",
    cardDescription: "cardDescription",
    cardFooter: "cardFooter",
    empty: "empty",
    emptyIcon: "emptyIcon",
    emptyText: "emptyText",
  },
}));

describe("TemplateGallery", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when open is false", () => {
    render(<TemplateGallery {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the dialog when open is true", () => {
    render(<TemplateGallery {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("renders the Templates heading", () => {
    render(<TemplateGallery {...defaultProps} />);
    expect(screen.getByRole("heading", { name: /templates/i })).toBeDefined();
  });

  it("renders all category buttons including All", () => {
    render(<TemplateGallery {...defaultProps} />);
    expect(screen.getByRole("button", { name: /^All/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Dashboards/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Forms/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Data Display/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Marketing/ })).toBeDefined();
  });

  it("renders template cards with titles", () => {
    render(<TemplateGallery {...defaultProps} />);
    expect(screen.getByText("Analytics Dashboard")).toBeDefined();
    expect(screen.getByText("Registration Form")).toBeDefined();
    expect(screen.getByText("Landing Page")).toBeDefined();
  });

  it("renders template card descriptions", () => {
    render(<TemplateGallery {...defaultProps} />);
    expect(screen.getByText(/KPI cards, line chart, bar chart/i)).toBeDefined();
  });

  it("filters templates when a category is clicked", () => {
    render(<TemplateGallery {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /^Forms/ }));
    expect(screen.getByText("Registration Form")).toBeDefined();
    expect(screen.getByText("Checkout Form")).toBeDefined();
    expect(screen.queryByText("Analytics Dashboard")).toBeNull();
    expect(screen.queryByText("Landing Page")).toBeNull();
  });

  it("shows all templates when All category is clicked after filtering", () => {
    render(<TemplateGallery {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /^Dashboards/ }));
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.getByText("Analytics Dashboard")).toBeDefined();
    expect(screen.getByText("Registration Form")).toBeDefined();
  });

  it("calls onSelect and onClose when a template card is clicked", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<TemplateGallery {...defaultProps} onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /use Analytics Dashboard template/i }));
    expect(onSelect).toHaveBeenCalledWith(
      "Dashboard with KPI cards, line chart, bar chart, and recent activity table"
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("filters templates by search input title match", () => {
    render(<TemplateGallery {...defaultProps} />);
    const searchInput = screen.getByRole("textbox", { name: /search templates/i });
    fireEvent.change(searchInput, { target: { value: "kanban" } });
    expect(screen.getByText("Kanban Board")).toBeDefined();
    expect(screen.queryByText("Analytics Dashboard")).toBeNull();
  });

  it("filters templates by search input description match", () => {
    render(<TemplateGallery {...defaultProps} />);
    const searchInput = screen.getByRole("textbox", { name: /search templates/i });
    fireEvent.change(searchInput, { target: { value: "draggable columns" } });
    expect(screen.getByText("Kanban Board")).toBeDefined();
    expect(screen.queryByText("Analytics Dashboard")).toBeNull();
  });

  it("shows empty state when search has no matches", () => {
    render(<TemplateGallery {...defaultProps} />);
    const searchInput = screen.getByRole("textbox", { name: /search templates/i });
    fireEvent.change(searchInput, { target: { value: "zzznomatch" } });
    expect(screen.getByText("No templates match your search")).toBeDefined();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<TemplateGallery {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close template gallery/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<TemplateGallery {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on Escape when gallery is closed", () => {
    const onClose = vi.fn();
    render(<TemplateGallery {...defaultProps} open={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when overlay backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<TemplateGallery {...defaultProps} onClose={onClose} />);
    // The overlay is the outermost div; clicking it (as target === currentTarget) triggers close
    const overlay = screen.getByRole("dialog").parentElement!;
    fireEvent.click(overlay, { target: overlay });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the All button with total template count", () => {
    render(<TemplateGallery {...defaultProps} />);
    const allButton = screen.getByRole("button", { name: /^All/ });
    expect(allButton.textContent).toContain("12");
  });

  it("resets to All category and clears search when reopened", () => {
    const { rerender } = render(<TemplateGallery {...defaultProps} open={true} />);
    const searchInput = screen.getByRole("textbox", { name: /search templates/i });
    fireEvent.change(searchInput, { target: { value: "kanban" } });
    fireEvent.click(screen.getByRole("button", { name: /^Dashboards/ }));

    // Close and reopen
    rerender(<TemplateGallery {...defaultProps} open={false} />);
    rerender(<TemplateGallery {...defaultProps} open={true} />);

    const newSearchInput = screen.getByRole("textbox", { name: /search templates/i });
    expect((newSearchInput as HTMLInputElement).value).toBe("");
    // All 12 templates should show again
    expect(screen.getByText("Analytics Dashboard")).toBeDefined();
    expect(screen.getByText("Registration Form")).toBeDefined();
  });
});
