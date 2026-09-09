import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RialtoProvider } from "../RialtoProvider";
import { useUIEnvironment } from "../useUIEnvironment";
import { useThemeState } from "../../hooks/useThemeState";
import { ThemeToggle } from "../../components/ThemeToggle/ThemeToggle";

/* ── Test consumer: mirrors how apps (e.g. marketing) wire the toggle ── */

function ToggleableApp() {
  const { theme, toggleTheme } = useThemeState();
  return (
    <RialtoProvider theme={theme}>
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
    </RialtoProvider>
  );
}

/* ── Test consumer component ─────────────────── */

function EnvironmentDisplay() {
  const { device, vibe, theme } = useUIEnvironment();
  return (
    <div>
      <span data-testid="vibe">{vibe}</span>
      <span data-testid="theme">{theme}</span>
      <span data-testid="pointer">{device.pointer}</span>
    </div>
  );
}

/* ── Tests ───────────────────────────────────── */

describe("RialtoProvider", () => {
  it("renders children", () => {
    render(
      <RialtoProvider>
        <span>Hello Rialto</span>
      </RialtoProvider>
    );
    expect(screen.getByText("Hello Rialto")).toBeInTheDocument();
  });

  it("sets data-theme attribute on wrapper", () => {
    const { container } = render(
      <RialtoProvider theme="dark">
        <span>Dark mode</span>
      </RialtoProvider>
    );
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveAttribute("data-theme", "dark");
  });

  it("syncs data-theme to document.documentElement", () => {
    render(
      <RialtoProvider theme="dark">
        <span>Dark mode</span>
      </RialtoProvider>
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("defaults to system theme (resolves from device context)", () => {
    const { container } = render(
      <RialtoProvider>
        <span>System</span>
      </RialtoProvider>
    );
    // matchMedia mock returns false for all queries, so colorScheme = 'light'
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveAttribute("data-theme", "light");
  });

  it("applies vibe overrides as inline styles", () => {
    const { container } = render(
      <RialtoProvider vibe="transacting">
        <span>Transacting</span>
      </RialtoProvider>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.getPropertyValue("--rialto-radius-default")).toBe("4px");
  });

  it("merges vibeOverrides on top of preset", () => {
    const { container } = render(
      <RialtoProvider vibe="transacting" vibeOverrides={{ "--rialto-radius-default": "2px" }}>
        <span>Custom override</span>
      </RialtoProvider>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    // vibeOverrides should override the preset value
    expect(wrapper.style.getPropertyValue("--rialto-radius-default")).toBe("2px");
  });

  it("provides context values via useUIEnvironment", () => {
    render(
      <RialtoProvider vibe="presenting" theme="dark">
        <EnvironmentDisplay />
      </RialtoProvider>
    );

    expect(screen.getByTestId("vibe")).toHaveTextContent("presenting");
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("pointer")).toHaveTextContent("fine");
  });

  it("does not apply inline styles for default vibe (empty overrides)", () => {
    const { container } = render(
      <RialtoProvider vibe="default">
        <span>Default</span>
      </RialtoProvider>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute("style")).toBeNull();
  });
});

describe("RialtoProvider theme-color meta sync (#4896)", () => {
  // Mirrors the two static, media-keyed tags every app ships in index.html
  // (the pre-hydration/no-JS fallback) so the effect under test has real
  // nodes to mutate, exactly like production.
  beforeEach(() => {
    document.head.innerHTML = `
      <meta name="theme-color" content="#f8f6f3" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#1e1c1a" media="(prefers-color-scheme: dark)" />
    `;
    localStorage.clear();
  });

  afterEach(() => {
    document.head.innerHTML = "";
    localStorage.clear();
  });

  function themeColorContents(): (string | null)[] {
    return Array.from(document.querySelectorAll('meta[name="theme-color"]')).map((meta) =>
      meta.getAttribute("content")
    );
  }

  it("sets both meta tags' content to match the initial resolved theme", () => {
    render(
      <RialtoProvider theme="light">
        <span>Light</span>
      </RialtoProvider>
    );
    expect(themeColorContents()).toEqual(["#f8f6f3", "#f8f6f3"]);
  });

  it("updates both meta tags' content after a real toggle click", async () => {
    const user = userEvent.setup();
    render(<ToggleableApp />);

    // Starting state: matchMedia mock resolves 'system' to light.
    expect(themeColorContents()).toEqual(["#f8f6f3", "#f8f6f3"]);

    await user.click(screen.getByRole("button"));

    expect(themeColorContents()).toEqual(["#1e1c1a", "#1e1c1a"]);
  });
});

describe("useUIEnvironment", () => {
  it("throws when used outside provider", () => {
    // Suppress console.error for the expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(<EnvironmentDisplay />);
    }).toThrow("useUIEnvironment must be used within <RialtoProvider>");

    spy.mockRestore();
  });
});
