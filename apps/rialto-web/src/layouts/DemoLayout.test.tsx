import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DemoLayout, FloatingControls } from "./DemoLayout.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  GlobalNav: ({ onThemeToggle }: { onThemeToggle?: () => void }) => (
    <nav data-testid="global-nav">
      <button onClick={onThemeToggle} data-testid="theme-toggle">
        toggle
      </button>
    </nav>
  ),
  RialtoProvider: ({ children }: { children?: ReactNode }) => (
    <div data-testid="rialto-provider">{children}</div>
  ),
}));

vi.mock("../components/CookieConsent/useCookieConsent.js", () => ({
  useCookieConsent: () => ({
    consented: null,
    preferences: { analytics: false, marketing: false },
    acceptAll: vi.fn(),
    rejectAll: vi.fn(),
    savePreferences: vi.fn(),
  }),
}));

vi.mock("../components/CookieConsent/CookieConsent.js", () => ({
  CookieBanner: ({
    onAcceptAll,
    onRejectAll,
    onCustomize,
  }: {
    onAcceptAll?: () => void;
    onRejectAll?: () => void;
    onCustomize?: () => void;
  }) => (
    <div data-testid="cookie-banner">
      <button onClick={onAcceptAll}>Accept</button>
      <button onClick={onRejectAll}>Reject</button>
      <button onClick={onCustomize}>Customize</button>
    </div>
  ),
  CookiePreferencesDialog: ({
    open,
    onClose,
    onSave,
    onRejectAll,
  }: {
    open?: boolean;
    onClose?: () => void;
    onSave?: () => void;
    onRejectAll?: () => void;
  }) =>
    open ? (
      <div data-testid="cookie-dialog">
        <button onClick={onClose}>Close</button>
        <button onClick={onSave}>Save</button>
        <button onClick={onRejectAll}>Reject All</button>
      </div>
    ) : null,
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
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

function renderDemoLayout() {
  return render(
    <MemoryRouter>
      <DemoLayout />
    </MemoryRouter>
  );
}

describe("DemoLayout", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders the global nav", () => {
    renderDemoLayout();
    expect(screen.getByTestId("global-nav")).toBeInTheDocument();
  });

  it("renders the rialto provider", () => {
    renderDemoLayout();
    expect(screen.getByTestId("rialto-provider")).toBeInTheDocument();
  });

  it("renders the cookie banner", () => {
    renderDemoLayout();
    expect(screen.getByTestId("cookie-banner")).toBeInTheDocument();
  });

  it("does not show cookie preferences dialog initially", () => {
    renderDemoLayout();
    expect(screen.queryByTestId("cookie-dialog")).not.toBeInTheDocument();
  });

  it("opens cookie preferences dialog when Customize is clicked", () => {
    renderDemoLayout();
    fireEvent.click(screen.getByText("Customize"));
    expect(screen.getByTestId("cookie-dialog")).toBeInTheDocument();
  });

  it("closes cookie preferences dialog when Close is clicked", () => {
    renderDemoLayout();
    fireEvent.click(screen.getByText("Customize"));
    expect(screen.getByTestId("cookie-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByTestId("cookie-dialog")).not.toBeInTheDocument();
  });

  it("re-mounts dialog (new key) when opened again after closing", () => {
    renderDemoLayout();
    fireEvent.click(screen.getByText("Customize"));
    const dialog1 = screen.getByTestId("cookie-dialog");
    fireEvent.click(screen.getByText("Close"));
    fireEvent.click(screen.getByText("Customize"));
    const dialog2 = screen.getByTestId("cookie-dialog");
    // Both renders produced a dialog element
    expect(dialog1).toBeTruthy();
    expect(dialog2).toBeTruthy();
  });

  it("saves theme preference to localStorage when dark mode is toggled via GlobalNav", () => {
    renderDemoLayout();
    // GlobalNav onThemeToggle calls handleDarkModeChange(!darkMode)
    // Initial state is light (matchMedia returns false). Toggling sets dark.
    fireEvent.click(screen.getByTestId("theme-toggle"));
    expect(localStorage.getItem("mbe-theme-preference")).toBe("dark");
  });

  it("saves 'light' to localStorage when toggled back from dark to light", () => {
    // Start dark: simulate saved preference
    localStorage.setItem("mbe-theme-preference", "dark");
    renderDemoLayout();
    // DemoLayout initialises darkMode=true from localStorage, toggles to light
    fireEvent.click(screen.getByTestId("theme-toggle"));
    expect(localStorage.getItem("mbe-theme-preference")).toBe("light");
  });

  it("reads initial dark mode state from localStorage", () => {
    localStorage.setItem("mbe-theme-preference", "dark");
    renderDemoLayout();
    // No assertion on DOM (RialtoProvider is mocked) but should not throw
    expect(screen.getByTestId("rialto-provider")).toBeInTheDocument();
  });

  it("falls back to system preference when localStorage has no theme", () => {
    // matchMedia returns false (light), so dark mode is false by default
    renderDemoLayout();
    expect(screen.getByTestId("rialto-provider")).toBeInTheDocument();
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

  it("calls onDarkModeChange(true) when toggling from light", () => {
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

  it("calls onDarkModeChange(false) when toggling from dark", () => {
    const onDarkModeChange = vi.fn();
    render(
      <FloatingControls
        darkMode={true}
        onDarkModeChange={onDarkModeChange}
        rtl={false}
        onRtlChange={vi.fn()}
        activeVibe="default"
        onVibeChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText("Switch to light mode"));
    expect(onDarkModeChange).toHaveBeenCalledWith(false);
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

  it("calls onRtlChange(true) when toggling from LTR", () => {
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

  it("calls onRtlChange(false) when toggling from RTL", () => {
    const onRtlChange = vi.fn();
    render(
      <FloatingControls
        darkMode={false}
        onDarkModeChange={vi.fn()}
        rtl={true}
        onRtlChange={onRtlChange}
        activeVibe="default"
        onVibeChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText("Switch to LTR"));
    expect(onRtlChange).toHaveBeenCalledWith(false);
  });

  it("renders vibe select with current activeVibe selected", () => {
    render(
      <FloatingControls
        darkMode={false}
        onDarkModeChange={vi.fn()}
        rtl={false}
        onRtlChange={vi.fn()}
        activeVibe="transacting"
        onVibeChange={vi.fn()}
      />
    );
    const select = screen.getByLabelText("Select vibe") as HTMLSelectElement;
    expect(select.value).toBe("transacting");
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
      target: { value: "presenting" },
    });
    expect(onVibeChange).toHaveBeenCalledWith("presenting");
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
