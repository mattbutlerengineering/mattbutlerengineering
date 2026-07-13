import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpacingPage } from "./SpacingPage.js";
import { SPACING_SCALE, SPACING_TOKEN_NAMES } from "./token-catalog.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({ children, as: As = "span" }: { children?: React.ReactNode; as?: React.ElementType }) => (
    <As>{children}</As>
  ),
  Divider: () => <hr />,
  Stack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

const LIGHT: Record<string, string> = {
  "--rialto-space-2xs": "4px",
  "--rialto-space-md": "16px",
  "--rialto-space-4xl": "96px",
};

function stubComputedTokens(): void {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(((
    el: Element,
    pseudo?: string | null
  ) => {
    const base = real(el, pseudo ?? undefined);
    if (el !== document.documentElement) return base;
    return {
      ...base,
      getPropertyValue: (name: string) => LIGHT[name] ?? base.getPropertyValue(name),
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

describe("SpacingPage", () => {
  it("renders the page title and the spacing scale heading", () => {
    render(<SpacingPage />);
    expect(screen.getByRole("heading", { name: "Spacing" })).toBeInTheDocument();
    expect(screen.getByText(SPACING_SCALE.label)).toBeInTheDocument();
  });

  it("renders one visualised step per catalogued spacing token", () => {
    render(<SpacingPage />);
    expect(screen.getAllByTestId("spacing-step")).toHaveLength(SPACING_TOKEN_NAMES.length);
  });

  it("labels each step with its token name and usage guidance", () => {
    render(<SpacingPage />);
    const md = SPACING_SCALE.tokens.find((t) => t.name === "--rialto-space-md");
    expect(md).toBeDefined();
    expect(screen.getByText("--rialto-space-md")).toBeInTheDocument();
    expect(screen.getByText(md!.usage)).toBeInTheDocument();
  });

  it("displays resolved values read from the live cascade, not hardcoded literals", () => {
    render(<SpacingPage />);
    expect(screen.getByText("4px")).toBeInTheDocument();
    expect(screen.getByText("96px")).toBeInTheDocument();
  });
});
