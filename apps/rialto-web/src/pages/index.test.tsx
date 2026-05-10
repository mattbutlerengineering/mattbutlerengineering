import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OverviewPage } from "./OverviewPage.js";
import { DemoLayout } from "../layouts/DemoLayout.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children }: any) => <button>{children}</button>,
  Text: ({ children }: any) => <p>{children}</p>,
  Heading: ({ children }: any) => <h2>{children}</h2>,
  Stack: ({ children }: any) => <div>{children}</div>,
  GlobalNav: () => <nav data-testid="global-nav" />,
  Footer: () => <footer data-testid="footer" />,
  PageHeader: ({ title, description }: any) => <header data-testid="page-header">{title}{description}</header>,
  Card: ({ children }: any) => <div>{children}</div>,
  Badge: ({ children }: any) => <span>{children}</span>,
  Icon: () => <div />,
  Table: ({ children }: any) => <table>{children}</table>,
  Stat: ({ label, value }: any) => <div data-testid="stat">{label} {value}</div>,
  Banner: () => <div data-testid="banner" />,
  Dialog: ({ children }: any) => <div data-testid="dialog">{children}</div>,
  Toggle: () => <input type="checkbox" data-testid="toggle" />,
  Divider: () => <hr data-testid="divider" />,
  RialtoProvider: ({ children }: any) => <div data-testid="rialto-provider">{children}</div>,
  useThemeState: () => ({ preference: "system", setTheme: vi.fn(), resolved: "light" }),
  resolveTheme: vi.fn((t) => t),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe("Rialto Web Pages and Layouts", () => {
  it("renders OverviewPage", () => {
    render(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    );
    expect(screen.getAllByTestId("stat").length).toBeGreaterThan(0);
  });

  it("renders DemoLayout", () => {
    render(
      <MemoryRouter>
        <DemoLayout />
      </MemoryRouter>
    );
    expect(screen.getByTestId("global-nav")).toBeInTheDocument();
  });
});
