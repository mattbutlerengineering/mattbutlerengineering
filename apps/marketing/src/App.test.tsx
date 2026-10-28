import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { App } from "./App.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  RialtoProvider: ({ children }: { children?: ReactNode }) => (
    <div data-testid="rialto-provider">{children}</div>
  ),
  GlobalNav: ({
    menu,
  }: {
    menu?: { label: string; items: { label: string; href: string; current?: boolean }[] };
  }) => (
    <nav data-testid="global-nav">
      {menu && (
        <ul data-testid="nav-menu" data-label={menu.label}>
          {menu.items.map((i) => (
            <li key={i.href} data-current={i.current ? "true" : "false"}>
              {i.href}
            </li>
          ))}
        </ul>
      )}
    </nav>
  ),
  Footer: () => <footer data-testid="footer" />,
  Text: ({ children }: { children?: ReactNode }) => <span data-testid="text">{children}</span>,
  Skeleton: ({ variant, height }: { variant?: string; height?: string }) => (
    <div data-testid="home-fallback" data-variant={variant} data-height={height} />
  ),
}));

describe("App", () => {
  it("renders the root app with routing", () => {
    render(
      <MemoryRouter>
        <App theme="light" onThemeToggle={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("global-nav")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });

  it("reserves the home route's content height before HomePage lazy-loads, so the footer never paints above it", () => {
    // Regression test for #4835: the footer used to render directly under
    // GlobalNav (in-viewport) while HomePage's lazy chunk was still loading,
    // then got shoved off-screen once real content mounted (CLS 0.28+).
    // The Suspense fallback for "/" must reserve the same height Hero
    // commits to (minHeight="90vh"), so nothing shifts once it resolves.
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App theme="light" onThemeToggle={vi.fn()} />
      </MemoryRouter>
    );
    const fallback = screen.getByTestId("home-fallback");
    expect(fallback).toHaveAttribute("data-variant", "rect");
    expect(fallback).toHaveAttribute("data-height", "90vh");
  });

  it("gives the nav an Engineering menu and marks the current page", () => {
    render(
      <MemoryRouter initialEntries={["/shipped/some-story"]}>
        <App theme="light" onThemeToggle={vi.fn()} />
      </MemoryRouter>
    );
    const menu = screen.getByTestId("nav-menu");
    expect(menu.getAttribute("data-label")).toBe("Engineering");
    expect(Array.from(menu.children).map((li) => li.textContent)).toEqual([
      "/metrics",
      "/shipped",
      "/weekly",
      "/status",
      "/ai-health",
      "/acmm",
    ]);
    const current = Array.from(menu.children).filter(
      (li) => li.getAttribute("data-current") === "true"
    );
    expect(current.map((li) => li.textContent)).toEqual(["/shipped"]);
  });
});
