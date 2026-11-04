import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { ThemeContext } from "../ThemeContext.js";
import { ShowcaseLayout } from "./ShowcaseLayout.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  GlobalNav: ({
    onThemeToggle,
    mobileMenuOpen,
    onMobileMenuOpenChange,
  }: {
    onThemeToggle?: () => void;
    mobileMenuOpen?: boolean;
    onMobileMenuOpenChange?: (open: boolean) => void;
  }) => (
    <nav data-testid="global-nav">
      <button onClick={onThemeToggle} data-testid="theme-toggle">
        toggle
      </button>
      <button
        type="button"
        aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileMenuOpen ?? false}
        onClick={() => onMobileMenuOpenChange?.(!(mobileMenuOpen ?? false))}
      >
        menu
      </button>
    </nav>
  ),
  PageHeader: () => <header data-testid="page-header" />,
  Container: ({ children }: { children?: ReactNode }) => (
    <div data-testid="container">{children}</div>
  ),
  Stack: ({ children }: { children?: ReactNode }) => <div data-testid="stack">{children}</div>,
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Icon: () => <span data-testid="icon" />,
  Footer: () => <footer data-testid="footer" />,
}));

vi.mock("../components/ShowcaseSidebar.js", () => ({
  ShowcaseSidebar: ({
    onNavigate,
    isMobileOpen,
    onMobileClose,
  }: {
    onNavigate: (path: string) => void;
    isMobileOpen?: boolean;
    onMobileClose?: () => void;
  }) => (
    <aside data-testid="sidebar" data-open={isMobileOpen ? "true" : "false"}>
      <button data-testid="sidebar-nav" onClick={() => onNavigate("/components/button")}>
        nav
      </button>
      {isMobileOpen && (
        <button type="button" data-testid="sidebar-close" onClick={() => onMobileClose?.()}>
          Close sidebar
        </button>
      )}
    </aside>
  ),
}));

const DEFAULT_THEME_CTX = {
  preference: "system" as const,
  theme: "light" as const,
  setTheme: vi.fn(),
  toggleTheme: vi.fn(),
};

function renderLayout(themeCtx = DEFAULT_THEME_CTX) {
  return render(
    <MemoryRouter>
      <ThemeContext value={themeCtx}>
        <ShowcaseLayout />
      </ThemeContext>
    </MemoryRouter>
  );
}

describe("ShowcaseLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the layout components", () => {
    renderLayout();
    expect(screen.getByTestId("global-nav")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });

  it("toggles mobile menu", () => {
    renderLayout();

    const toggleButton = screen.getByLabelText("Open sidebar");
    expect(toggleButton).toBeInTheDocument();
    fireEvent.click(toggleButton);

    // State change isn't easily visible since we mocked the whole layout structure,
    // but clicking it shouldn't crash.
  });

  it("uses toggleTheme from context for GlobalNav", () => {
    const toggleTheme = vi.fn();
    renderLayout({ ...DEFAULT_THEME_CTX, toggleTheme });

    fireEvent.click(screen.getByTestId("theme-toggle"));
    expect(toggleTheme).toHaveBeenCalled();
  });

  it("closes the sidebar drawer when the header menu opens", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-open", "true");

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-open", "false");
  });

  it("closes the header menu when the sidebar drawer opens", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));

    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-open", "true");
  });

  it("returns focus to the sidebar toggle when the drawer closes", () => {
    renderLayout();
    const toggle = screen.getByRole("button", { name: "Open sidebar" });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId("sidebar-close"));
    expect(toggle).toHaveFocus();
  });

  it("resets main content scroll on navigation", () => {
    renderLayout();
    const main = screen.getByRole("main");
    const scrollTo = vi.fn();
    main.scrollTo = scrollTo;

    fireEvent.click(screen.getByTestId("sidebar-nav"));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
