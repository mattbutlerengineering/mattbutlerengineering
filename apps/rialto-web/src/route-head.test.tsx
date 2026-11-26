import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { HOME_TITLE } from "./data/route-head-data.js";
import { useRouteHead } from "./use-route-head.js";

const ORIGIN = "https://mattbutlerengineering.com";

function installShell(): void {
  document.head.innerHTML = [
    '<meta name="theme-color" content="#f8f6f3" media="(prefers-color-scheme: light)" />',
    '<meta name="theme-color" content="#1e1c1a" media="(prefers-color-scheme: dark)" />',
    '<meta name="robots" content="index, follow" />',
    `<link rel="canonical" href="${ORIGIN}/rialto/" />`,
    '<meta property="og:title" content="Rialto Design System" />',
    `<meta property="og:url" content="${ORIGIN}/rialto/" />`,
    '<meta name="twitter:title" content="Rialto Design System" />',
    `<title>${HOME_TITLE}</title>`,
  ].join("");
  document.title = HOME_TITLE;
}

function canonical(): string | null {
  return document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
}

function meta(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute("content") ?? null;
}

function themeColors(): string[] {
  return [...document.head.querySelectorAll('meta[name="theme-color"]')].map(
    (tag) => tag.getAttribute("content") ?? ""
  );
}

function Harness() {
  const navigate = useNavigate();
  useRouteHead();
  return (
    <nav>
      <button type="button" onClick={() => navigate("/components/button")}>
        to-button
      </button>
      <button type="button" onClick={() => navigate("/examples/invoice")}>
        to-invoice
      </button>
      <button type="button" onClick={() => navigate("/demos/login")}>
        to-login
      </button>
      <button type="button" onClick={() => navigate("/")}>
        to-home
      </button>
    </nav>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter basename="/rialto" initialEntries={[`/rialto${path}`]}>
      <Routes>
        <Route path="*" element={<Harness />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("useRouteHead", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.title = HOME_TITLE;
  });

  it("points canonical and social tags at the route, and leaves theme-color alone", () => {
    installShell();
    renderAt("/components/accordion");

    expect(document.title).toBe("Accordion — Rialto");
    expect(canonical()).toBe(`${ORIGIN}/rialto/components/accordion`);
    expect(meta('meta[property="og:url"]')).toBe(`${ORIGIN}/rialto/components/accordion`);
    expect(meta('meta[property="og:title"]')).toBe("Accordion — Rialto");
    expect(meta('meta[name="twitter:title"]')).toBe("Accordion — Rialto");
    expect(themeColors()).toEqual(["#f8f6f3", "#1e1c1a"]);
    expect(meta('meta[name="robots"]')).toBe("index, follow");
  });

  it("updates tags on client navigation and restores the home shell", async () => {
    installShell();
    const user = userEvent.setup();
    renderAt("/examples/invoice");

    expect(document.title).toBe("Invoice — Rialto");
    expect(canonical()).toBe(`${ORIGIN}/rialto/examples/invoice`);

    await user.click(screen.getByRole("button", { name: "to-button" }));
    expect(document.title).toBe("Button — Rialto");
    expect(canonical()).toBe(`${ORIGIN}/rialto/components/button`);
    expect(meta('meta[property="og:url"]')).toBe(`${ORIGIN}/rialto/components/button`);
    expect(meta('meta[property="og:title"]')).toBe("Button — Rialto");
    expect(meta('meta[name="twitter:title"]')).toBe("Button — Rialto");

    await user.click(screen.getByRole("button", { name: "to-login" }));
    expect(document.title).toBe("Sign In — Rialto");
    expect(canonical()).toBe(`${ORIGIN}/rialto/demos/login`);

    await user.click(screen.getByRole("button", { name: "to-home" }));
    expect(document.title).toBe(HOME_TITLE);
    expect(canonical()).toBe(`${ORIGIN}/rialto/`);
    expect(meta('meta[property="og:url"]')).toBe(`${ORIGIN}/rialto/`);
    expect(meta('meta[property="og:title"]')).toBe("Rialto Design System");
    expect(meta('meta[name="twitter:title"]')).toBe("Rialto Design System");
    expect(themeColors()).toEqual(["#f8f6f3", "#1e1c1a"]);
  });

  it("creates the canonical link when the shell is missing it", () => {
    document.head.innerHTML = `<title>${HOME_TITLE}</title>`;
    renderAt("/examples/checkout");
    expect(document.title).toBe("Checkout — Rialto");
    expect(canonical()).toBe(`${ORIGIN}/rialto/examples/checkout`);
    expect(meta('meta[property="og:url"]')).toBe(`${ORIGIN}/rialto/examples/checkout`);
  });
});
