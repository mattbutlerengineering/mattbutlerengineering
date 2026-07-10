import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SurfacesPage } from "./SurfacesPage.js";
import { ELEVATION_LEVELS, SURFACE_LEVELS, SURFACE_TOKEN_NAMES } from "./token-catalog.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({ children, as: As = "span" }: { children?: React.ReactNode; as?: React.ElementType }) => (
    <As>{children}</As>
  ),
  Divider: () => <hr />,
  Stack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

const LIGHT: Record<string, string> = {
  "--rialto-surface": "#f8f6f3",
  "--rialto-surface-elevated": "#fdfcfa",
  "--rialto-shadow-md": "md-shadow-light",
};
const DARK: Record<string, string> = {
  "--rialto-surface": "#1e1c1a",
  "--rialto-surface-elevated": "#2a2725",
  "--rialto-shadow-md": "md-shadow-dark",
};

function stubComputedTokens(): void {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(((el: Element, pseudo?: string | null) => {
    const base = real(el, pseudo ?? undefined);
    if (el !== document.documentElement) return base;
    const theme = document.documentElement.getAttribute("data-theme") ?? "light";
    const map = theme === "dark" ? DARK : LIGHT;
    return { ...base, getPropertyValue: (name: string) => map[name] ?? base.getPropertyValue(name) } as CSSStyleDeclaration;
  }) as typeof window.getComputedStyle);
}

beforeEach(() => {
  stubComputedTokens();
  document.documentElement.setAttribute("data-theme", "light");
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-theme");
});

describe("SurfacesPage", () => {
  it("renders the page title and both surface/elevation group headings", () => {
    render(<SurfacesPage />);
    expect(screen.getByRole("heading", { name: "Surfaces" })).toBeInTheDocument();
    expect(screen.getByText(SURFACE_LEVELS.label)).toBeInTheDocument();
    expect(screen.getByText(ELEVATION_LEVELS.label)).toBeInTheDocument();
  });

  it("renders one composed example per surface and elevation token", () => {
    render(<SurfacesPage />);
    expect(screen.getAllByTestId("surface-example")).toHaveLength(SURFACE_TOKEN_NAMES.length);
  });

  it("labels each example with its token name and usage guidance", () => {
    render(<SurfacesPage />);
    expect(screen.getByText("--rialto-surface-elevated")).toBeInTheDocument();
    expect(screen.getByText("--rialto-shadow-md")).toBeInTheDocument();
    const elevated = SURFACE_LEVELS.tokens.find((t) => t.name === "--rialto-surface-elevated");
    expect(screen.getByText(elevated!.usage)).toBeInTheDocument();
  });

  it("displays resolved values read from the live cascade, not hardcoded literals", () => {
    render(<SurfacesPage />);
    expect(screen.getByText("#fdfcfa")).toBeInTheDocument();
    expect(screen.getByText("md-shadow-light")).toBeInTheDocument();
  });

  it("re-reads resolved values when the theme switches to dark", async () => {
    render(<SurfacesPage />);
    expect(screen.getByText("#f8f6f3")).toBeInTheDocument();
    await act(async () => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    expect(screen.getByText("#1e1c1a")).toBeInTheDocument();
    expect(screen.getByText("md-shadow-dark")).toBeInTheDocument();
  });
});
