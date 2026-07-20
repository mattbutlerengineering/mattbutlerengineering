import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { KeyboardEvent, ReactNode } from "react";
import { OverviewPage } from "./OverviewPage.js";
import { DemoLayout, FloatingControls } from "../layouts/DemoLayout.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Heading: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  Hero: ({
    title,
    subtitle,
    eyebrow,
    actions,
  }: {
    title?: ReactNode;
    subtitle?: string;
    eyebrow?: string;
    actions?: ReactNode;
  }) => (
    <section aria-label="hero">
      {eyebrow ? <p>{eyebrow}</p> : null}
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {actions}
    </section>
  ),
  Stack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  GlobalNav: () => <nav data-testid="global-nav" />,
  Footer: () => <footer data-testid="footer" />,
  PageHeader: ({ title, description }: { title?: ReactNode; description?: ReactNode }) => (
    <header data-testid="page-header">
      {title}
      {description}
    </header>
  ),
  Card: ({
    children,
    role,
    tabIndex,
    "aria-label": ariaLabel,
    onKeyDown,
  }: {
    children?: ReactNode;
    role?: string;
    tabIndex?: number;
    "aria-label"?: string;
    onKeyDown?: (event: KeyboardEvent) => void;
  }) => (
    <div role={role} tabIndex={tabIndex} aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {children}
    </div>
  ),
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Icon: () => <div />,
  Table: ({ children }: { children?: ReactNode }) => <table>{children}</table>,
  Stat: ({ label, value }: { label?: ReactNode; value?: ReactNode }) => (
    <div data-testid="stat">
      {label} {value}
    </div>
  ),
  Banner: () => <div data-testid="banner" />,
  Dialog: ({ children }: { children?: ReactNode }) => <div data-testid="dialog">{children}</div>,
  Toggle: () => <input type="checkbox" data-testid="toggle" />,
  Divider: () => <hr data-testid="divider" />,
  RialtoProvider: ({ children }: { children?: ReactNode }) => (
    <div data-testid="rialto-provider">{children}</div>
  ),
  useThemeState: () => ({ preference: "system", setTheme: vi.fn(), resolved: "light" }),
  resolveTheme: vi.fn((t) => t),
}));

vi.mock("@mattbutlerengineering/rialto/manifest", () => ({
  default: {
    version: "0.0.0",
    generatedAt: "2026-01-01T00:00:00.000Z",
    components: [{ name: "Alpha" }, { name: "Beta" }, { name: "Gamma" }],
  },
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe("Rialto Web Pages and Layouts", () => {
  it("renders OverviewPage", () => {
    render(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    );
    expect(screen.getAllByTestId("stat").length).toBeGreaterThan(0);
  });

  it("renders DemoLayout", () => {
    render(
      <MemoryRouter>
        <DemoLayout />
      </MemoryRouter>
    );
    expect(screen.getByTestId("global-nav")).toBeInTheDocument();
  });
});

describe("OverviewPage — Hero, headings, and manifest-driven stats", () => {
  function renderOverview() {
    return render(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    );
  }

  it("sources the Components stat from the generated manifest, not the nav registry", () => {
    renderOverview();
    const componentStat = screen
      .getAllByTestId("stat")
      .find((stat) => stat.textContent?.includes("Components"));
    // Mock manifest ships exactly 3 components.
    expect(componentStat?.textContent).toContain("3");
  });

  it("sources the Design Tokens stat from the build-time token count", () => {
    renderOverview();
    const tokenStat = screen
      .getAllByTestId("stat")
      .find((stat) => stat.textContent?.includes("Design Tokens"));
    expect(tokenStat?.textContent).toContain(String(__RIALTO_TOKEN_COUNT__));
  });

  it("renders a single h1 via the Hero and section titles via the Heading primitive", () => {
    renderOverview();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 2, name: /browse by category/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /getting started/i })).toBeInTheDocument();
  });

  it("renders a primary conversion CTA", () => {
    renderOverview();
    expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
  });

  it("retains keyboard-accessible category cards", () => {
    renderOverview();
    const cards = screen.getAllByRole("button", { name: /browse .* components/i });
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card).toHaveAttribute("tabindex", "0");
    }
  });
});

describe("FloatingControls", () => {
  it("renders dark mode toggle with correct aria-label in light mode", () => {
    render(
      <FloatingControls
        darkMode={false}
        onDarkModeChange={vi.fn()}
        rtl={false}
        onRtlChange={vi.fn()}
        activeVibe="default"
        onVibeChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Switch to dark mode")).toBeInTheDocument();
  });

  it("renders dark mode toggle with correct aria-label in dark mode", () => {
    render(
      <FloatingControls
        darkMode={true}
        onDarkModeChange={vi.fn()}
        rtl={false}
        onRtlChange={vi.fn()}
        activeVibe="default"
        onVibeChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Switch to light mode")).toBeInTheDocument();
  });

  it("calls onDarkModeChange when dark mode button is clicked", () => {
    const onDarkModeChange = vi.fn();
    render(
      <FloatingControls
        darkMode={false}
        onDarkModeChange={onDarkModeChange}
        rtl={false}
        onRtlChange={vi.fn()}
        activeVibe="default"
        onVibeChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText("Switch to dark mode"));
    expect(onDarkModeChange).toHaveBeenCalledWith(true);
  });

  it("renders RTL toggle with correct aria-label in LTR mode", () => {
    render(
      <FloatingControls
        darkMode={false}
        onDarkModeChange={vi.fn()}
        rtl={false}
        onRtlChange={vi.fn()}
        activeVibe="default"
        onVibeChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Switch to RTL")).toBeInTheDocument();
  });

  it("renders RTL toggle with correct aria-label in RTL mode", () => {
    render(
      <FloatingControls
        darkMode={false}
        onDarkModeChange={vi.fn()}
        rtl={true}
        onRtlChange={vi.fn()}
        activeVibe="default"
        onVibeChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Switch to LTR")).toBeInTheDocument();
  });

  it("calls onRtlChange when RTL button is clicked", () => {
    const onRtlChange = vi.fn();
    render(
      <FloatingControls
        darkMode={false}
        onDarkModeChange={vi.fn()}
        rtl={false}
        onRtlChange={onRtlChange}
        activeVibe="default"
        onVibeChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText("Switch to RTL"));
    expect(onRtlChange).toHaveBeenCalledWith(true);
  });

  it("renders vibe select with default value", () => {
    render(
      <FloatingControls
        darkMode={false}
        onDarkModeChange={vi.fn()}
        rtl={false}
        onRtlChange={vi.fn()}
        activeVibe="default"
        onVibeChange={vi.fn()}
      />
    );
    const select = screen.getByLabelText("Select vibe") as HTMLSelectElement;
    expect(select.value).toBe("default");
  });

  it("calls onVibeChange when vibe select changes", () => {
    const onVibeChange = vi.fn();
    render(
      <FloatingControls
        darkMode={false}
        onDarkModeChange={vi.fn()}
        rtl={false}
        onRtlChange={vi.fn()}
        activeVibe="default"
        onVibeChange={onVibeChange}
      />
    );
    fireEvent.change(screen.getByLabelText("Select vibe"), {
      target: { value: "transacting" },
    });
    expect(onVibeChange).toHaveBeenCalledWith("transacting");
  });

  it("renders cookie preferences button when onOpenCookiePrefs is provided", () => {
    const onOpenCookiePrefs = vi.fn();
    render(
      <FloatingControls
        darkMode={false}
        onDarkModeChange={vi.fn()}
        rtl={false}
        onRtlChange={vi.fn()}
        activeVibe="default"
        onVibeChange={vi.fn()}
        onOpenCookiePrefs={onOpenCookiePrefs}
      />
    );
    const cookieBtn = screen.getByLabelText("Cookie preferences");
    expect(cookieBtn).toBeInTheDocument();
    fireEvent.click(cookieBtn);
    expect(onOpenCookiePrefs).toHaveBeenCalled();
  });

  it("does not render cookie preferences button when onOpenCookiePrefs is not provided", () => {
    render(
      <FloatingControls
        darkMode={false}
        onDarkModeChange={vi.fn()}
        rtl={false}
        onRtlChange={vi.fn()}
        activeVibe="default"
        onVibeChange={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("Cookie preferences")).toBeNull();
  });
});
