import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ShadowsPage } from "./ShadowsPage.js";
import { SHADOW_GROUPS, SHADOW_TOKEN_NAMES } from "./token-catalog.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({ children, as: As = "span" }: { children?: React.ReactNode; as?: React.ElementType }) => (
    <As>{children}</As>
  ),
  Divider: () => <hr />,
  Stack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

const LIGHT: Record<string, string> = {
  "--rialto-shadow-sm": "sm-shadow-light",
  "--rialto-shadow-lg": "lg-shadow-light",
};
const DARK: Record<string, string> = {
  "--rialto-shadow-sm": "sm-shadow-dark",
  "--rialto-shadow-lg": "lg-shadow-dark",
};

function stubComputedTokens(): void {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(((el: Element, pseudo?: string | null) => {
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

describe("ShadowsPage", () => {
  it("renders the page title and every shadow group heading", () => {
    render(<ShadowsPage />);
    expect(screen.getByRole("heading", { name: "Shadows" })).toBeInTheDocument();
    for (const group of SHADOW_GROUPS) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
    }
  });

  it("renders one surface sample per catalogued shadow token", () => {
    render(<ShadowsPage />);
    expect(screen.getAllByTestId("shadow-sample")).toHaveLength(SHADOW_TOKEN_NAMES.length);
  });

  it("labels each sample with its token name and usage guidance", () => {
    render(<ShadowsPage />);
    const lg = SHADOW_GROUPS.flatMap((g) => g.tokens).find((t) => t.name === "--rialto-shadow-lg");
    expect(lg).toBeDefined();
    expect(screen.getByText("--rialto-shadow-lg")).toBeInTheDocument();
    expect(screen.getByText(lg!.usage)).toBeInTheDocument();
  });

  it("displays resolved values read from the live cascade, not hardcoded literals", () => {
    render(<ShadowsPage />);
    expect(screen.getByText("sm-shadow-light")).toBeInTheDocument();
  });

  it("re-reads resolved values when the theme switches to dark", async () => {
    render(<ShadowsPage />);
    expect(screen.getByText("sm-shadow-light")).toBeInTheDocument();
    await act(async () => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    expect(screen.getByText("sm-shadow-dark")).toBeInTheDocument();
    expect(screen.queryByText("sm-shadow-light")).not.toBeInTheDocument();
  });
});
