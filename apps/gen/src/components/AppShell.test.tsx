import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { AppShell, useAppShellPanels } from "./AppShell.js";
import { useShortcuts } from "../hooks/useShortcuts.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  AppBar: ({ logo, actions }: { logo: React.ReactNode; actions: React.ReactNode }) => (
    <div data-testid="appbar">
      <div data-testid="appbar-logo">{logo}</div>
      <div data-testid="appbar-actions">{actions}</div>
    </div>
  ),
  ThemeToggle: ({ onToggle }: { onToggle: () => void }) => (
    <button type="button" onClick={onToggle} data-testid="theme-toggle">
      Theme
    </button>
  ),
  Avatar: ({ name }: { name: string }) => <span data-testid="avatar">{name}</span>,
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button
      type="button"
      onClick={onClick}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  ),
  Shortcut: () => <span data-testid="shortcut" />,
  CommandPalette: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: unknown[];
    groups: string[];
    placeholder: string;
  }) => (
    <div data-testid="command-palette" data-open={open}>
      <button type="button" onClick={() => onOpenChange(false)}>
        Close palette
      </button>
    </div>
  ),
  Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Text: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <span {...(props as React.HTMLAttributes<HTMLSpanElement>)}>{children}</span>
  ),
}));

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(() => ({
    user: { name: "Test User", email: "test@test.com", picture: null },
    signOut: vi.fn(),
    accessToken: "test-token",
  })),
}));

vi.mock("../contexts/ThemeContext.js", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

const mockToggleHistory = vi.fn();
const mockToggleInspector = vi.fn();
const mockCloseOverlays = vi.fn();
let panelLayoutState = {
  historyVisible: true,
  inspectorVisible: true,
  breakpoint: "desktop" as "mobile" | "tablet" | "desktop",
  toggleHistory: mockToggleHistory,
  toggleInspector: mockToggleInspector,
  closeOverlays: mockCloseOverlays,
};

vi.mock("../hooks/usePanelLayout.js", () => ({
  usePanelLayout: () => panelLayoutState,
}));

vi.mock("./AppShell.module.css", () => ({
  default: {
    shell: "shell",
    logoGroup: "logoGroup",
    logoButton: "logoButton",
    logoAccent: "logoAccent",
    logoText: "logoText",
    shortcutHint: "shortcutHint",
    panelToggle: "panelToggle",
    panelToggleActive: "panelToggleActive",
    actions: "actions",
    content: "content",
    skipLink: "skipLink",
    sidePanel: "sidePanel",
    overlayPanel: "overlayPanel",
    overlayStart: "overlayStart",
    overlayEnd: "overlayEnd",
    backdrop: "backdrop",
  },
}));

const child = <div data-testid="child-content">Content</div>;

beforeEach(() => {
  vi.clearAllMocks();
  panelLayoutState = {
    historyVisible: true,
    inspectorVisible: true,
    breakpoint: "desktop",
    toggleHistory: mockToggleHistory,
    toggleInspector: mockToggleInspector,
    closeOverlays: mockCloseOverlays,
  };
});

describe("AppShell", () => {
  it("renders children inside the content area", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.getByTestId("child-content")).toBeDefined();
    expect(screen.getByText("Content")).toBeDefined();
  });

  it("renders the AppBar", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.getByTestId("appbar")).toBeDefined();
  });

  it("renders Sign out button", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.getByRole("button", { name: /sign out/i })).toBeDefined();
  });

  it("calls onSignOut when Sign out is clicked", () => {
    const onSignOut = vi.fn();
    render(<AppShell onSignOut={onSignOut}>{child}</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("renders avatar with user name", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.getByTestId("avatar")).toBeDefined();
    expect(screen.getByText("Test User")).toBeDefined();
  });

  it("renders the theme toggle", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.getByTestId("theme-toggle")).toBeDefined();
  });

  it("shows Templates button when onTemplatesOpen is provided", () => {
    render(<AppShell onTemplatesOpen={vi.fn()}>{child}</AppShell>);
    expect(screen.getByRole("button", { name: /templates/i })).toBeDefined();
  });

  it("hides Templates button when onTemplatesOpen is not provided", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.queryByRole("button", { name: /templates/i })).toBeNull();
  });

  it("calls onTemplatesOpen when Templates button is clicked", () => {
    const onTemplatesOpen = vi.fn();
    render(<AppShell onTemplatesOpen={onTemplatesOpen}>{child}</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: /templates/i }));
    expect(onTemplatesOpen).toHaveBeenCalledTimes(1);
  });

  it("hides the shortcuts button when onShortcutsOpen is not provided", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.queryByRole("button", { name: /keyboard shortcuts/i })).toBeNull();
  });

  it("calls onShortcutsOpen from the header shortcuts button", () => {
    const onShortcutsOpen = vi.fn();
    render(<AppShell onShortcutsOpen={onShortcutsOpen}>{child}</AppShell>);
    fireEvent.click(
      within(screen.getByTestId("appbar-actions")).getByRole("button", {
        name: /keyboard shortcuts/i,
      })
    );
    expect(onShortcutsOpen).toHaveBeenCalledTimes(1);
  });

  it("calls onLogoClick when the logo is clicked", () => {
    const onLogoClick = vi.fn();
    render(<AppShell onLogoClick={onLogoClick}>{child}</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: /return to empty state/i }));
    expect(onLogoClick).toHaveBeenCalledTimes(1);
  });
});

describe("AppShell — shell-owned panel toggle state", () => {
  it("always renders the history toggle (shell owns the state, no callback needed)", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.getByRole("button", { name: /toggle history panel/i })).toBeDefined();
  });

  it("always renders the inspector toggle (shell owns the state, no callback needed)", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.getByRole("button", { name: /toggle json inspector/i })).toBeDefined();
  });

  it("toggles history visibility through the shell-owned state", () => {
    render(<AppShell>{child}</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: /toggle history panel/i }));
    expect(mockToggleHistory).toHaveBeenCalledTimes(1);
  });

  it("toggles inspector visibility through the shell-owned state", () => {
    render(<AppShell>{child}</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: /toggle json inspector/i }));
    expect(mockToggleInspector).toHaveBeenCalledTimes(1);
  });

  it("reflects history visibility in aria-pressed", () => {
    render(<AppShell>{child}</AppShell>);
    expect(
      screen.getByRole("button", { name: /toggle history panel/i }).getAttribute("aria-pressed")
    ).toBe("true");
  });
});

describe("AppShell.HistoryRegion", () => {
  it("renders panel content when history is visible", () => {
    render(
      <AppShell>
        <AppShell.HistoryRegion>
          <div data-testid="history-content">history</div>
        </AppShell.HistoryRegion>
      </AppShell>
    );
    expect(screen.getByTestId("history-content")).toBeDefined();
  });

  it("renders nothing when history is hidden", () => {
    panelLayoutState = { ...panelLayoutState, historyVisible: false };
    render(
      <AppShell>
        <AppShell.HistoryRegion>
          <div data-testid="history-content">history</div>
        </AppShell.HistoryRegion>
      </AppShell>
    );
    expect(screen.queryByTestId("history-content")).toBeNull();
  });

  it("renders nothing when fullscreen even if history is visible", () => {
    render(
      <AppShell isFullscreen>
        <AppShell.HistoryRegion>
          <div data-testid="history-content">history</div>
        </AppShell.HistoryRegion>
      </AppShell>
    );
    expect(screen.queryByTestId("history-content")).toBeNull();
  });
});

function shellTree(panel: "history" | "inspector" | "both" = "history") {
  return (
    <AppShell>
      {(panel === "history" || panel === "both") && (
        <AppShell.HistoryRegion>
          <button type="button">All</button>
          <button type="button">Favorites</button>
        </AppShell.HistoryRegion>
      )}
      {(panel === "inspector" || panel === "both") && (
        <AppShell.InspectorRegion>
          <button type="button">Copy JSON</button>
        </AppShell.InspectorRegion>
      )}
      <button type="button">Behind the overlay</button>
    </AppShell>
  );
}

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

async function flushFocusRestore(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(undefined));
    });
  });
}

describe("AppShell overlay panels", () => {
  it("keeps the desktop history panel in the page: no dialog, Escape does not dismiss it", () => {
    render(shellTree("history"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "All" })).toBeDefined();
    pressEscape();
    expect(mockCloseOverlays).not.toHaveBeenCalled();
  });

  it("closes a narrow history overlay on Escape, traps Tab, and restores focus to the toggle", async () => {
    panelLayoutState = { ...panelLayoutState, historyVisible: false, breakpoint: "mobile" };
    const { rerender } = render(shellTree("history"));
    const toggle = screen.getByRole("button", { name: /toggle history panel/i });
    toggle.focus();

    panelLayoutState = { ...panelLayoutState, historyVisible: true, breakpoint: "mobile" };
    rerender(shellTree("history"));

    const dialog = screen.getByRole("dialog", { name: "History" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const all = screen.getByRole("button", { name: "All" });
    const favorites = screen.getByRole("button", { name: "Favorites" });
    expect(document.activeElement).toBe(all);

    favorites.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(all);
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: /sign out/i }));

    all.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(favorites);

    screen.getByRole("button", { name: "Behind the overlay" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(all);

    const escape = pressEscape();
    expect(escape.defaultPrevented).toBe(true);
    expect(mockCloseOverlays).toHaveBeenCalledTimes(1);

    panelLayoutState = { ...panelLayoutState, historyVisible: false };
    rerender(shellTree("history"));
    await flushFocusRestore();
    expect(document.activeElement).toBe(toggle);
  });

  it("does not yank focus back to the toggle while the overlay is open (StrictMode)", async () => {
    panelLayoutState = { ...panelLayoutState, historyVisible: false, breakpoint: "mobile" };
    const { rerender } = render(<StrictMode>{shellTree("history")}</StrictMode>);
    screen.getByRole("button", { name: /toggle history panel/i }).focus();

    panelLayoutState = { ...panelLayoutState, historyVisible: true, breakpoint: "mobile" };
    rerender(<StrictMode>{shellTree("history")}</StrictMode>);

    const all = screen.getByRole("button", { name: "All" });
    expect(document.activeElement).toBe(all);
    await flushFocusRestore();
    expect(document.activeElement).toBe(all);
  });

  it("closes a tablet history overlay from the backdrop as well as Escape", () => {
    panelLayoutState = { ...panelLayoutState, breakpoint: "tablet" };
    const { container } = render(shellTree("history"));
    const backdrop = container.querySelector(".backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(mockCloseOverlays).toHaveBeenCalledTimes(1);
  });

  it("does not let an open history overlay consume Escape that stops generation on desktop", () => {
    const stop = vi.fn();
    function Probe() {
      useShortcuts({ stop });
      return null;
    }
    render(
      <AppShell>
        <AppShell.HistoryRegion>
          <button type="button">All</button>
        </AppShell.HistoryRegion>
        <Probe />
      </AppShell>
    );
    pressEscape();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(mockCloseOverlays).not.toHaveBeenCalled();
  });

  it("claims Escape while the history overlay is open so generation does not also stop", () => {
    panelLayoutState = { ...panelLayoutState, breakpoint: "mobile" };
    const stop = vi.fn();
    function Probe() {
      useShortcuts({ stop });
      return null;
    }
    render(
      <AppShell>
        <AppShell.HistoryRegion>
          <button type="button">All</button>
        </AppShell.HistoryRegion>
        <Probe />
      </AppShell>
    );
    pressEscape();
    expect(mockCloseOverlays).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });

  it("leaves Escape to a dialog that is already open above the overlay", () => {
    panelLayoutState = { ...panelLayoutState, breakpoint: "mobile" };
    function OtherDialog() {
      return (
        <div role="dialog" aria-modal="true" aria-label="Template gallery">
          <button type="button">Close template gallery</button>
        </div>
      );
    }
    render(
      <AppShell>
        <AppShell.HistoryRegion>
          <button type="button">All</button>
        </AppShell.HistoryRegion>
        <OtherDialog />
      </AppShell>
    );
    const escape = pressEscape();
    expect(mockCloseOverlays).not.toHaveBeenCalled();
    expect(escape.defaultPrevented).toBe(false);
  });

  it("closes a narrow JSON inspector overlay on Escape", () => {
    panelLayoutState = {
      ...panelLayoutState,
      historyVisible: false,
      inspectorVisible: true,
      breakpoint: "mobile",
    };
    render(shellTree("inspector"));
    expect(screen.getByRole("dialog", { name: "JSON inspector" }).getAttribute("aria-modal")).toBe(
      "true"
    );
    pressEscape();
    expect(mockCloseOverlays).toHaveBeenCalledTimes(1);
  });

  it("dismisses both narrow overlays on one Escape", () => {
    panelLayoutState = { ...panelLayoutState, breakpoint: "mobile" };
    render(shellTree("both"));
    pressEscape();
    expect(mockCloseOverlays).toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
  });
});

describe("AppShell.InspectorRegion", () => {
  it("renders panel content when inspector is visible", () => {
    render(
      <AppShell>
        <AppShell.InspectorRegion>
          <div data-testid="inspector-content">inspector</div>
        </AppShell.InspectorRegion>
      </AppShell>
    );
    expect(screen.getByTestId("inspector-content")).toBeDefined();
  });

  it("renders nothing when inspector is hidden", () => {
    panelLayoutState = { ...panelLayoutState, inspectorVisible: false };
    render(
      <AppShell>
        <AppShell.InspectorRegion>
          <div data-testid="inspector-content">inspector</div>
        </AppShell.InspectorRegion>
      </AppShell>
    );
    expect(screen.queryByTestId("inspector-content")).toBeNull();
  });
});

describe("AppShell.CommandPalette", () => {
  it("renders the command palette as a composable child", () => {
    render(
      <AppShell>
        <AppShell.CommandPalette items={[]} />
      </AppShell>
    );
    expect(screen.getByTestId("command-palette")).toBeDefined();
  });

  it("does not render a command palette when the child is not composed", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.queryByTestId("command-palette")).toBeNull();
  });
});

describe("useAppShellPanels", () => {
  function Probe() {
    const panels = useAppShellPanels();
    return (
      <div>
        <span data-testid="history-visible">{String(panels.historyVisible)}</span>
        <span data-testid="inspector-visible">{String(panels.inspectorVisible)}</span>
        <span data-testid="breakpoint">{panels.breakpoint}</span>
        <button type="button" onClick={() => panels.openPalette()}>
          open palette
        </button>
        <button type="button" onClick={() => panels.closeOverlays()}>
          close overlays
        </button>
      </div>
    );
  }

  it("exposes the shell-owned panel state to the page body", () => {
    render(
      <AppShell>
        <Probe />
      </AppShell>
    );
    expect(screen.getByTestId("history-visible").textContent).toBe("true");
    expect(screen.getByTestId("inspector-visible").textContent).toBe("true");
    expect(screen.getByTestId("breakpoint").textContent).toBe("desktop");
  });

  it("opens the command palette through the exposed control", () => {
    render(
      <AppShell>
        <AppShell.CommandPalette items={[]} />
        <Probe />
      </AppShell>
    );
    expect(screen.getByTestId("command-palette").getAttribute("data-open")).toBe("false");
    fireEvent.click(screen.getByText("open palette"));
    expect(screen.getByTestId("command-palette").getAttribute("data-open")).toBe("true");
  });

  it("delegates closeOverlays to the panel layout", () => {
    render(
      <AppShell>
        <Probe />
      </AppShell>
    );
    fireEvent.click(screen.getByText("close overlays"));
    expect(mockCloseOverlays).toHaveBeenCalledTimes(1);
  });

  it("throws when used outside an AppShell", () => {
    function Orphan() {
      useAppShellPanels();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/AppShell/);
    spy.mockRestore();
  });

  it("does not expose isFullscreen — fullscreen is owned solely by usePlaygroundState", () => {
    function Probe() {
      const panels = useAppShellPanels();
      return <span data-testid="has-fullscreen">{"isFullscreen" in panels ? "yes" : "no"}</span>;
    }
    render(
      <AppShell>
        <Probe />
      </AppShell>
    );
    expect(screen.getByTestId("has-fullscreen").textContent).toBe("no");
  });
});
