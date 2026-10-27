import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import type { ReactNode } from "react";
import { App } from "./App.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  GlobalNav: () => <nav />,
  Footer: () => <footer />,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Skeleton: () => <div />,
}));

const DEFAULT_TITLE = "Matt Butler Engineering";

// Enumerate concrete routes from the router config in App.tsx. Redirect-only
// routes (<Navigate>) never render a page of their own, so they are skipped.
function routePaths(): string[] {
  const source = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
  const routes = [...source.matchAll(/<Route\s+path="([^"]+)"\s+element=\{([\s\S]*?)\}\s*\/>/g)];
  return routes
    .filter(([, , element]) => !element?.includes("<Navigate"))
    .map(([, path]) =>
      (path ?? "").replace(":slug", "example-story").replace(/^\*$/, "/no-such-page")
    );
}

function metaDescription(): string {
  return document.head.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
}

function renderAt(path: string) {
  document.title = DEFAULT_TITLE;
  render(
    <MemoryRouter initialEntries={[path]}>
      <App theme="light" onThemeToggle={vi.fn()} />
    </MemoryRouter>
  );
  return { title: document.title, description: metaDescription() };
}

describe("marketing route metadata", () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="description" content="Default site description" />';
  });

  it("restores the index.html defaults when navigating from a mapped route to /", () => {
    document.title = DEFAULT_TITLE;
    let go: (to: string) => void = () => undefined;
    function Nav() {
      go = useNavigate();
      return null;
    }
    render(
      <MemoryRouter initialEntries={["/metrics"]}>
        <Nav />
        <App theme="light" onThemeToggle={vi.fn()} />
      </MemoryRouter>
    );
    expect(document.title).not.toBe(DEFAULT_TITLE);
    act(() => go("/"));
    expect(document.title).toBe(DEFAULT_TITLE);
    expect(metaDescription()).toBe("Default site description");
  });

  it("finds the router config routes", () => {
    expect(routePaths()).toEqual(
      expect.arrayContaining(["/", "/status", "/weekly", "/metrics", "/ai-health", "/shipped"])
    );
  });

  it.each(routePaths().filter((p) => p !== "/"))(
    "%s has a non-default title and description",
    (path) => {
      const { title, description } = renderAt(path);
      expect(title).not.toBe(DEFAULT_TITLE);
      expect(title).toContain(DEFAULT_TITLE);
      expect(description).not.toBe("Default site description");
      expect(description.length).toBeGreaterThan(20);
    }
  );

  it("gives every route a distinct title and description", () => {
    const seen = routePaths().map((path) => {
      document.body.innerHTML = "";
      return renderAt(path);
    });
    const nonHome = seen.filter((_, i) => routePaths()[i] !== "/");
    expect(new Set(nonHome.map((m) => m.title)).size).toBe(nonHome.length);
    expect(new Set(nonHome.map((m) => m.description)).size).toBe(nonHome.length);
  });
});
