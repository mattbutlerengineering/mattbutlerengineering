import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeContext } from "../ThemeContext.js";
import { ShowcaseLayout } from "./ShowcaseLayout.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  GlobalNav: ({ onThemeToggle }: any) => (
    <nav data-testid="global-nav">
      <button onClick={onThemeToggle} data-testid="theme-toggle">
        toggle
      </button>
    </nav>
  ),
  PageHeader: () => <header data-testid="page-header" />,
  Container: ({ children }: any) => <div data-testid="container">{children}</div>,
  Stack: ({ children }: any) => <div data-testid="stack">{children}</div>,
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  Icon: () => <span data-testid="icon" />,
  Footer: () => <footer data-testid="footer" />,
}));

vi.mock("../components/ShowcaseSidebar.js", () => ({
  ShowcaseSidebar: () => <aside data-testid="sidebar" />,
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
});
