import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RadiusPage } from "./RadiusPage.js";
import { RADIUS_SCALE, RADIUS_TOKEN_NAMES } from "./token-catalog.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({ children, as: As = "span" }: { children?: React.ReactNode; as?: React.ElementType }) => (
    <As>{children}</As>
  ),
  Divider: () => <hr />,
  Stack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

const LIGHT: Record<string, string> = {
  "--rialto-radius-none": "0px",
  "--rialto-radius-default": "6px",
  "--rialto-radius-round": "9999px",
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

describe("RadiusPage", () => {
  it("renders the page title and the radius scale heading", () => {
    render(<RadiusPage />);
    expect(screen.getByRole("heading", { name: "Radius" })).toBeInTheDocument();
    expect(screen.getByText(RADIUS_SCALE.label)).toBeInTheDocument();
  });

  it("renders one representative shape per catalogued radius token", () => {
    render(<RadiusPage />);
    expect(screen.getAllByTestId("radius-shape")).toHaveLength(RADIUS_TOKEN_NAMES.length);
  });

  it("labels each shape with its token name and usage guidance", () => {
    render(<RadiusPage />);
    const soft = RADIUS_SCALE.tokens.find((t) => t.name === "--rialto-radius-soft");
    expect(soft).toBeDefined();
    expect(screen.getByText("--rialto-radius-soft")).toBeInTheDocument();
    expect(screen.getByText(soft!.usage)).toBeInTheDocument();
  });

  it("displays resolved values read from the live cascade, not hardcoded literals", () => {
    render(<RadiusPage />);
    expect(screen.getByText("6px")).toBeInTheDocument();
    expect(screen.getByText("9999px")).toBeInTheDocument();
  });
});
