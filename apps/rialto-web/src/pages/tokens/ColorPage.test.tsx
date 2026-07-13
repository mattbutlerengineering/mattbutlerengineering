import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ColorPage } from "./ColorPage.js";
import { COLOR_GROUPS, COLOR_TOKEN_NAMES } from "./token-catalog.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({ children, as: As = "span" }: { children?: React.ReactNode; as?: React.ElementType }) => (
    <As>{children}</As>
  ),
  Divider: () => <hr />,
  Stack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

const LIGHT: Record<string, string> = {
  "--rialto-surface": "#f8f6f3",
  "--rialto-accent": "#b0841e",
  "--rialto-error": "#b84a3c",
};
const DARK: Record<string, string> = {
  "--rialto-surface": "#1e1c1a",
  "--rialto-accent": "#d4a23a",
  "--rialto-error": "#e06050",
};

function stubComputedTokens(): void {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(((
    el: Element,
    pseudo?: string | null
  ) => {
    const base = real(el, pseudo ?? undefined);
    if (el !== document.documentElement) return base;
    const theme = document.documentElement.getAttribute("data-theme") ?? "light";
    const map = theme === "dark" ? DARK : LIGHT;
    return {
      ...base,
      getPropertyValue: (name: string) => map[name] ?? base.getPropertyValue(name),
    } as CSSStyleDeclaration;
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

describe("ColorPage", () => {
  it("renders the page title and every semantic color group heading", () => {
    render(<ColorPage />);
    expect(screen.getByRole("heading", { name: "Color" })).toBeInTheDocument();
    for (const group of COLOR_GROUPS) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
    }
  });

  it("renders one swatch per catalogued color token", () => {
    render(<ColorPage />);
    expect(screen.getAllByTestId("color-swatch")).toHaveLength(COLOR_TOKEN_NAMES.length);
  });

  it("labels swatches with their token name and usage guidance", () => {
    render(<ColorPage />);
    const surface = COLOR_GROUPS.flatMap((g) => g.tokens).find(
      (t) => t.name === "--rialto-surface"
    );
    expect(surface).toBeDefined();
    expect(screen.getByText("--rialto-surface")).toBeInTheDocument();
    expect(screen.getByText(surface!.usage)).toBeInTheDocument();
  });

  it("displays resolved values read from the live cascade, not hardcoded literals", () => {
    render(<ColorPage />);
    expect(screen.getByText("#f8f6f3")).toBeInTheDocument();
    expect(screen.getByText("#b0841e")).toBeInTheDocument();
  });

  it("re-reads resolved values when the theme switches to dark", async () => {
    render(<ColorPage />);
    expect(screen.getByText("#f8f6f3")).toBeInTheDocument();
    await act(async () => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    expect(screen.getByText("#1e1c1a")).toBeInTheDocument();
    expect(screen.queryByText("#f8f6f3")).not.toBeInTheDocument();
  });
});
