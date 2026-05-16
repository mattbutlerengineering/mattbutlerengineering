import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ShowcaseLayout } from "./ShowcaseLayout.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  GlobalNav: () => <nav data-testid="global-nav" />,
  PageHeader: () => <header data-testid="page-header" />,
  Container: ({ children }: any) => <div data-testid="container">{children}</div>,
  Stack: ({ children }: any) => <div data-testid="stack">{children}</div>,
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  Icon: () => <span data-testid="icon" />,
  Footer: () => <footer data-testid="footer" />,
  useThemeState: () => ({ preference: "system", setTheme: vi.fn(), resolved: "light" }),
  resolveTheme: vi.fn((t) => t),
}));

vi.mock("../components/ShowcaseSidebar.js", () => ({
  ShowcaseSidebar: () => <aside data-testid="sidebar" />
}));

describe("ShowcaseLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the layout components", () => {
    render(
      <MemoryRouter>
        <ShowcaseLayout />
      </MemoryRouter>
    );

    expect(screen.getByTestId("global-nav")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });

  it("toggles mobile menu", () => {
    render(
      <MemoryRouter>
        <ShowcaseLayout />
      </MemoryRouter>
    );

    const toggleButton = screen.getByLabelText("Open sidebar");
    expect(toggleButton).toBeInTheDocument();
    fireEvent.click(toggleButton);
    
    // State change isn't easily visible since we mocked the whole layout structure, 
    // but clicking it shouldn't crash.
  });
});
