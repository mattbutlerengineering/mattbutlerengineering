import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppShell, useAppShellPanels } from "./AppShell.js";

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
});
