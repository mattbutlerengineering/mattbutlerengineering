import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ShowcaseSidebar } from "./ShowcaseSidebar.js";
import type { NavSection, NavItem } from "../data/nav-sections.js";

const MOCK_SECTIONS: NavSection[] = [
  {
    label: "Forms",
    items: [
      { id: "button", label: "Button", path: "/components/button" },
      { id: "input", label: "Input", path: "/components/input" },
    ],
  },
  {
    label: "Data Display",
    items: [
      { id: "card", label: "Card", path: "/components/card" },
      { id: "table", label: "Table", path: "/components/table" },
    ],
  },
  {
    label: "Tokens",
    items: [
      { id: "motion", label: "Motion", path: "/components/motion", comingSoon: true },
    ],
  },
];

const MOCK_DEMO_PAGES: NavItem[] = [
  { id: "sign-in", label: "Sign In", path: "/demos/login" },
];

function renderSidebar(props: Partial<React.ComponentProps<typeof ShowcaseSidebar>> = {}) {
  const defaultProps = {
    sections: MOCK_SECTIONS,
    demoPages: MOCK_DEMO_PAGES,
    activePath: "/components/button",
    onNavigate: vi.fn(),
    ...props,
  };

  return render(
    <MemoryRouter>
      <ShowcaseSidebar {...defaultProps} />
    </MemoryRouter>
  );
}

describe("ShowcaseSidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders all section labels", () => {
    renderSidebar();

    expect(screen.getByText("Forms")).toBeInTheDocument();
    expect(screen.getByText("Data Display")).toBeInTheDocument();
    expect(screen.getByText("Tokens")).toBeInTheDocument();
    expect(screen.getByText("Demos")).toBeInTheDocument();
  });

  it("renders nav items within sections", () => {
    renderSidebar();

    expect(screen.getByText("Button")).toBeInTheDocument();
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
    expect(screen.getByText("Table")).toBeInTheDocument();
  });

  it("renders coming soon items with badge", () => {
    renderSidebar();

    expect(screen.getByText("Motion")).toBeInTheDocument();
    expect(screen.getByText("coming soon")).toBeInTheDocument();
  });

  it("renders demo pages in a Demos section", () => {
    renderSidebar();

    expect(screen.getByText("Sign In")).toBeInTheDocument();
  });

  it("collapses section on click", () => {
    renderSidebar();

    expect(screen.getByText("Button")).toBeInTheDocument();
    const formsHeader = screen.getByText("Forms").closest("button")!;
    fireEvent.click(formsHeader);

    expect(screen.queryByText("Button")).not.toBeInTheDocument();
    expect(screen.queryByText("Input")).not.toBeInTheDocument();
    // Other sections still visible
    expect(screen.getByText("Card")).toBeInTheDocument();
  });

  it("expands a collapsed section on click", () => {
    renderSidebar();

    const formsHeader = screen.getByText("Forms").closest("button")!;
    fireEvent.click(formsHeader); // collapse
    expect(screen.queryByText("Button")).not.toBeInTheDocument();

    fireEvent.click(formsHeader); // expand
    expect(screen.getByText("Button")).toBeInTheDocument();
  });

  it("filters items by search input", () => {
    renderSidebar();

    const searchInput = screen.getByLabelText("Filter components");
    fireEvent.change(searchInput, { target: { value: "button" } });

    expect(screen.getByText("Button")).toBeInTheDocument();
    expect(screen.queryByText("Card")).not.toBeInTheDocument();
    expect(screen.queryByText("Table")).not.toBeInTheDocument();
    expect(screen.queryByText("Input")).not.toBeInTheDocument();
  });

  it("shows empty state when filter matches nothing", () => {
    renderSidebar();

    const searchInput = screen.getByLabelText("Filter components");
    fireEvent.change(searchInput, { target: { value: "zzzznonexistent" } });

    expect(screen.getByText(/No components match/)).toBeInTheDocument();
  });

  it("clears filter when clear button is clicked", () => {
    renderSidebar();

    const searchInput = screen.getByLabelText("Filter components");
    fireEvent.change(searchInput, { target: { value: "button" } });

    expect(screen.queryByText("Card")).not.toBeInTheDocument();

    const clearButton = screen.getByLabelText("Clear filter");
    fireEvent.click(clearButton);

    expect(screen.getByText("Card")).toBeInTheDocument();
    expect(screen.getByText("Button")).toBeInTheDocument();
  });

  it("shows section item counts", () => {
    renderSidebar();

    // Forms has 2 items, Data Display has 2 items
    const counts = screen.getAllByText("2");
    expect(counts.length).toBeGreaterThanOrEqual(2);
  });

  it("persists collapsed state to localStorage", () => {
    renderSidebar();

    const formsHeader = screen.getByText("Forms").closest("button")!;
    fireEvent.click(formsHeader);

    const stored = localStorage.getItem("rialto-showcase-collapsed");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed).toContain("Forms");
  });

  it("has correct aria-label for navigation", () => {
    renderSidebar();
    expect(screen.getByLabelText("Component navigation")).toBeInTheDocument();
  });
});
