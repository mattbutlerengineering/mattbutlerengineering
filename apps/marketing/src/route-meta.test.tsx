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
const ORIGIN = "https://mattbutlerengineering.com";
const DEFAULT_DESCRIPTION = "Default site description";

// index.html's homepage head, minus <title> (set via document.title). Canonical
// keeps the trailing slash; og:url does not — those two strings must survive
// a visit to "/" unchanged.
const INDEX_HEAD = [
  `<meta name="description" content="${DEFAULT_DESCRIPTION}" />`,
  `<link rel="canonical" href="${ORIGIN}/" />`,
  `<meta property="og:title" content="${DEFAULT_TITLE}" />`,
  `<meta property="og:description" content="${DEFAULT_DESCRIPTION}" />`,
  `<meta property="og:url" content="${ORIGIN}" />`,
  `<meta name="twitter:title" content="${DEFAULT_TITLE}" />`,
  `<meta name="twitter:description" content="${DEFAULT_DESCRIPTION}" />`,
  `<meta name="robots" content="index, follow" />`,
].join("");

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

function metaContent(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute("content") ?? null;
}

function metaDescription(): string {
  return metaContent('meta[name="description"]') ?? "";
}

function canonicalHref(): string | null {
  return document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
}

function installIndexHead(): void {
  document.head.innerHTML = INDEX_HEAD;
  document.title = DEFAULT_TITLE;
}

function renderAt(path: string) {
  installIndexHead();
  render(
    <MemoryRouter initialEntries={[path]}>
      <App theme="light" onThemeToggle={vi.fn()} />
    </MemoryRouter>
  );
  return { title: document.title, description: metaDescription() };
}

describe("marketing route metadata", () => {
  beforeEach(() => {
    installIndexHead();
  });

  it("restores the index.html defaults when navigating from a mapped route to /", () => {
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
    expect(canonicalHref()).toBe(`${ORIGIN}/metrics`);
    act(() => go("/"));
    expect(document.title).toBe(DEFAULT_TITLE);
    expect(metaDescription()).toBe(DEFAULT_DESCRIPTION);
    expect(canonicalHref()).toBe(`${ORIGIN}/`);
    expect(metaContent('meta[property="og:url"]')).toBe(ORIGIN);
    expect(metaContent('meta[property="og:title"]')).toBe(DEFAULT_TITLE);
    expect(metaContent('meta[name="twitter:title"]')).toBe(DEFAULT_TITLE);
    expect(metaContent('meta[property="og:description"]')).toBe(DEFAULT_DESCRIPTION);
    expect(metaContent('meta[name="twitter:description"]')).toBe(DEFAULT_DESCRIPTION);
    expect(metaContent('meta[name="robots"]')).toBe("index, follow");
  });

  it("updates canonical and social tags when navigating between mapped routes", () => {
    let go: (to: string) => void = () => undefined;
    function Nav() {
      go = useNavigate();
      return null;
    }
    render(
      <MemoryRouter initialEntries={["/status"]}>
        <Nav />
        <App theme="light" onThemeToggle={vi.fn()} />
      </MemoryRouter>
    );
    expect(canonicalHref()).toBe(`${ORIGIN}/status`);
    expect(metaContent('meta[property="og:title"]')).toBe(
      "System Status — Matt Butler Engineering"
    );
    act(() => go("/weekly"));
    expect(document.title).toBe("Weekly Information Intake — Matt Butler Engineering");
    expect(canonicalHref()).toBe(`${ORIGIN}/weekly`);
    expect(metaContent('meta[property="og:url"]')).toBe(`${ORIGIN}/weekly`);
    expect(metaContent('meta[property="og:title"]')).toBe(document.title);
    expect(metaContent('meta[name="twitter:title"]')).toBe(document.title);
    expect(metaContent('meta[property="og:description"]')).toBe(metaDescription());
    expect(metaContent('meta[name="twitter:description"]')).toBe(metaDescription());
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

  it("keeps the homepage canonical and social url exactly as index.html wrote them", () => {
    renderAt("/");
    expect(document.title).toBe(DEFAULT_TITLE);
    expect(metaDescription()).toBe(DEFAULT_DESCRIPTION);
    expect(canonicalHref()).toBe(`${ORIGIN}/`);
    expect(metaContent('meta[property="og:url"]')).toBe(ORIGIN);
    expect(metaContent('meta[property="og:title"]')).toBe(DEFAULT_TITLE);
    expect(metaContent('meta[name="twitter:title"]')).toBe(DEFAULT_TITLE);
  });

  it.each(routePaths().filter((path) => path !== "/" && path !== "/no-such-page"))(
    "%s canonical and social tags use that route's own url and title",
    (path) => {
      const { title, description } = renderAt(path);
      expect(canonicalHref()).toBe(`${ORIGIN}${path}`);
      expect(metaContent('meta[property="og:url"]')).toBe(`${ORIGIN}${path}`);
      expect(metaContent('meta[property="og:title"]')).toBe(title);
      expect(metaContent('meta[name="twitter:title"]')).toBe(title);
      expect(metaContent('meta[property="og:description"]')).toBe(description);
      expect(metaContent('meta[name="twitter:description"]')).toBe(description);
      expect(metaContent('meta[name="robots"]')).toBe("index, follow");
    }
  );

  it("does not canonicalize the 404 to the homepage", () => {
    const { title, description } = renderAt("/no-such-page");
    expect(title).toBe("Page not found — Matt Butler Engineering");
    expect(canonicalHref()).toBeNull();
    expect(metaContent('meta[property="og:url"]')).toBeNull();
    expect(metaContent('meta[name="robots"]')).toBe("noindex");
    expect(metaContent('meta[property="og:title"]')).toBe(title);
    expect(metaContent('meta[name="twitter:title"]')).toBe(title);
    expect(metaContent('meta[property="og:description"]')).toBe(description);
    expect(metaContent('meta[name="twitter:description"]')).toBe(description);
  });

  it("restores an indexable canonical after leaving the 404", () => {
    let go: (to: string) => void = () => undefined;
    function Nav() {
      go = useNavigate();
      return null;
    }
    render(
      <MemoryRouter initialEntries={["/no-such-page"]}>
        <Nav />
        <App theme="light" onThemeToggle={vi.fn()} />
      </MemoryRouter>
    );
    expect(canonicalHref()).toBeNull();
    expect(metaContent('meta[name="robots"]')).toBe("noindex");
    act(() => go("/status"));
    expect(document.title).toBe("System Status — Matt Butler Engineering");
    expect(canonicalHref()).toBe(`${ORIGIN}/status`);
    expect(metaContent('meta[property="og:url"]')).toBe(`${ORIGIN}/status`);
    expect(metaContent('meta[name="robots"]')).toBe("index, follow");
  });
});
