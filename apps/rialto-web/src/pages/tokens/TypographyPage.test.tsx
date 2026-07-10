import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TypographyPage } from "./TypographyPage.js";
import { TYPOGRAPHY_GROUPS, TYPOGRAPHY_TOKEN_NAMES } from "./token-catalog.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({ children, as: As = "span" }: { children?: React.ReactNode; as?: React.ElementType }) => (
    <As>{children}</As>
  ),
  Divider: () => <hr />,
  Stack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

const VALUES: Record<string, string> = {
  "--rialto-text-xl": "1.728rem",
  "--rialto-font-mono": '"DM Mono", ui-monospace, monospace',
  "--rialto-weight-medium": "500",
  "--rialto-leading-normal": "1.5",
  "--rialto-tracking-wide": "0.04em",
};

function stubComputedTokens(): void {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(((el: Element, pseudo?: string | null) => {
    const base = real(el, pseudo ?? undefined);
    if (el !== document.documentElement) return base;
    return { ...base, getPropertyValue: (name: string) => VALUES[name] ?? base.getPropertyValue(name) } as CSSStyleDeclaration;
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

describe("TypographyPage", () => {
  it("renders the page title and every typography group heading", () => {
    render(<TypographyPage />);
    expect(screen.getByRole("heading", { name: "Typography" })).toBeInTheDocument();
    for (const group of TYPOGRAPHY_GROUPS) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
    }
  });

  it("renders one specimen per catalogued typography token", () => {
    render(<TypographyPage />);
    expect(screen.getAllByTestId("type-specimen")).toHaveLength(TYPOGRAPHY_TOKEN_NAMES.length);
  });

  it("labels each specimen with its token name", () => {
    render(<TypographyPage />);
    expect(screen.getByText("--rialto-text-xl")).toBeInTheDocument();
    expect(screen.getByText("--rialto-font-mono")).toBeInTheDocument();
    expect(screen.getByText("--rialto-weight-medium")).toBeInTheDocument();
  });

  it("displays resolved values read from the live cascade, not hardcoded literals", () => {
    render(<TypographyPage />);
    expect(screen.getByText("1.728rem")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("0.04em")).toBeInTheDocument();
  });

  it("renders correctly under a dark theme root", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<TypographyPage />);
    expect(screen.getByText("--rialto-text-xl")).toBeInTheDocument();
    expect(screen.getByText("1.728rem")).toBeInTheDocument();
  });
});
