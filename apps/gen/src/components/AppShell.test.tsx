import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppShell } from "./AppShell.js";

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
  },
}));

const child = <div data-testid="child-content">Content</div>;

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("shows panel toggle for history when onToggleHistory is provided", () => {
    const onToggleHistory = vi.fn();
    render(<AppShell onToggleHistory={onToggleHistory}>{child}</AppShell>);
    expect(screen.getByRole("button", { name: /toggle history panel/i })).toBeDefined();
  });

  it("hides history panel toggle when onToggleHistory is not provided", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.queryByRole("button", { name: /toggle history panel/i })).toBeNull();
  });

  it("calls onToggleHistory when history toggle is clicked", () => {
    const onToggleHistory = vi.fn();
    render(<AppShell onToggleHistory={onToggleHistory}>{child}</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: /toggle history panel/i }));
    expect(onToggleHistory).toHaveBeenCalledTimes(1);
  });

  it("shows inspector panel toggle when onToggleInspector is provided", () => {
    const onToggleInspector = vi.fn();
    render(<AppShell onToggleInspector={onToggleInspector}>{child}</AppShell>);
    expect(screen.getByRole("button", { name: /toggle json inspector/i })).toBeDefined();
  });

  it("hides inspector panel toggle when onToggleInspector is not provided", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.queryByRole("button", { name: /toggle json inspector/i })).toBeNull();
  });

  it("shows Templates button when onTemplatesOpen is provided", () => {
    const onTemplatesOpen = vi.fn();
    render(<AppShell onTemplatesOpen={onTemplatesOpen}>{child}</AppShell>);
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

  it("renders avatar with user name", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.getByTestId("avatar")).toBeDefined();
    expect(screen.getByText("Test User")).toBeDefined();
  });

  it("renders the theme toggle", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.getByTestId("theme-toggle")).toBeDefined();
  });

  it("renders CommandPalette when paletteOpen and commandItems are provided", () => {
    const onPaletteOpenChange = vi.fn();
    render(
      <AppShell paletteOpen={true} onPaletteOpenChange={onPaletteOpenChange} commandItems={[]}>
        {child}
      </AppShell>
    );
    expect(screen.getByTestId("command-palette")).toBeDefined();
  });

  it("does not render CommandPalette when paletteOpen is undefined", () => {
    render(<AppShell>{child}</AppShell>);
    expect(screen.queryByTestId("command-palette")).toBeNull();
  });
});
