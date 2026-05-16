import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OverviewPage } from "./OverviewPage.js";
import { DemoLayout, FloatingControls } from "../layouts/DemoLayout.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children }: any) => <button>{children}</button>,
  Text: ({ children }: any) => <span>{children}</span>,
  Heading: ({ children }: any) => <h2>{children}</h2>,
  Stack: ({ children }: any) => <div>{children}</div>,
  GlobalNav: () => <nav data-testid="global-nav" />,
  Footer: () => <footer data-testid="footer" />,
  PageHeader: ({ title, description }: any) => (
    <header data-testid="page-header">
      {title}
      {description}
    </header>
  ),
  Card: ({ children }: any) => <div>{children}</div>,
  Badge: ({ children }: any) => <span>{children}</span>,
  Icon: () => <div />,
  Table: ({ children }: any) => <table>{children}</table>,
  Stat: ({ label, value }: any) => (
    <div data-testid="stat">
      {label} {value}
    </div>
  ),
  Banner: () => <div data-testid="banner" />,
  Dialog: ({ children }: any) => <div data-testid="dialog">{children}</div>,
  Toggle: () => <input type="checkbox" data-testid="toggle" />,
  Divider: () => <hr data-testid="divider" />,
  RialtoProvider: ({ children }: any) => <div data-testid="rialto-provider">{children}</div>,
  useThemeState: () => ({ preference: "system", setTheme: vi.fn(), resolved: "light" }),
  resolveTheme: vi.fn((t) => t),
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
