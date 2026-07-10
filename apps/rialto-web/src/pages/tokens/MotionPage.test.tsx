import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MotionPage } from "./MotionPage.js";
import { MOTION_GROUPS, MOTION_TOKEN_NAMES } from "./token-catalog.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({ children, as: As = "span" }: { children?: React.ReactNode; as?: React.ElementType }) => (
    <As>{children}</As>
  ),
  Divider: () => <hr />,
  Stack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

const LIGHT: Record<string, string> = {
  "--rialto-duration-fast": "0.1s",
  "--rialto-duration-standard": "0.15s",
  "--rialto-ease-precision": "cubic-bezier(0.2, 0, 0, 1)",
};

function stubComputedTokens(): void {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(((el: Element, pseudo?: string | null) => {
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

describe("MotionPage", () => {
  it("renders the page title and every motion group heading", () => {
    render(<MotionPage />);
    expect(screen.getByRole("heading", { name: "Motion" })).toBeInTheDocument();
    for (const group of MOTION_GROUPS) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
    }
  });

  it("renders one live demo per catalogued motion token", () => {
    render(<MotionPage />);
    expect(screen.getAllByTestId("motion-demo")).toHaveLength(MOTION_TOKEN_NAMES.length);
  });

  it("labels each demo with its token name and usage guidance", () => {
    render(<MotionPage />);
    const fast = MOTION_GROUPS.flatMap((g) => g.tokens).find(
      (t) => t.name === "--rialto-duration-fast"
    );
    expect(fast).toBeDefined();
    expect(screen.getByText("--rialto-duration-fast")).toBeInTheDocument();
    expect(screen.getByText(fast!.usage)).toBeInTheDocument();
  });

  it("displays resolved values read from the live cascade, not hardcoded literals", () => {
    render(<MotionPage />);
    expect(screen.getByText("0.1s")).toBeInTheDocument();
    expect(screen.getByText("cubic-bezier(0.2, 0, 0, 1)")).toBeInTheDocument();
  });

  it("documents reduced-motion behaviour", () => {
    render(<MotionPage />);
    expect(screen.getByRole("heading", { name: /reduced motion/i })).toBeInTheDocument();
  });

  it("re-reads resolved values when the theme switches", async () => {
    render(<MotionPage />);
    expect(screen.getByText("0.1s")).toBeInTheDocument();
    await act(async () => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    // Motion tokens are theme-invariant, so the value persists across the flip.
    expect(screen.getByText("0.1s")).toBeInTheDocument();
  });
});
