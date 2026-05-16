/* eslint-disable mbe-local/prefer-rialto-components */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockSend = vi.fn();
const mockStop = vi.fn();
const mockSaveSpec = vi.fn().mockResolvedValue({ id: "saved-1" });
const mockToggleFavorite = vi.fn();
const mockDeleteSpec = vi.fn();
const mockToggleHistory = vi.fn();
const mockToggleInspector = vi.fn();
const mockCloseOverlays = vi.fn();
const mockSignOut = vi.fn();
const mockToast = vi.fn();
const mockToggleTheme = vi.fn();

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ signOut: mockSignOut, user: { name: "Test" }, accessToken: "t" }),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useToast: () => ({ toast: mockToast }),
  CommandPalette: () => null,
}));

vi.mock("@json-render/react", () => ({
  JSONUIProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Renderer: () => <div data-testid="renderer" />,
}));

vi.mock("../hooks/useGenStream.js", () => ({
  useGenStream: () => ({
    spec: null,
    isStreaming: false,
    error: null,
    rawLines: [],
    send: mockSend,
    stop: mockStop,
  }),
}));

vi.mock("../hooks/useSpecsApi.js", () => ({
  useSpecsApi: () => ({
    specs: [
      {
        id: "s1",
        prompt: "Dashboard",
        spec: {},
        rawLines: ["{}"],
        isFavorite: false,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ],
    isLoading: false,
    fetchSpecs: vi.fn(),
    saveSpec: mockSaveSpec,
    toggleFavorite: mockToggleFavorite,
    deleteSpec: mockDeleteSpec,
  }),
}));

vi.mock("../hooks/usePanelLayout.js", () => ({
  usePanelLayout: () => ({
    historyVisible: true,
    inspectorVisible: true,
    breakpoint: "desktop",
    toggleHistory: mockToggleHistory,
    toggleInspector: mockToggleInspector,
    closeOverlays: mockCloseOverlays,
  }),
}));

vi.mock("../contexts/ThemeContext.js", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: mockToggleTheme }),
}));

vi.mock("../components/AppShell.js", () => ({
  AppShell: ({
    children,
    onSignOut,
    onLogoClick,
    onTemplatesOpen,
  }: {
    children: React.ReactNode;
    onSignOut?: () => void;
    onLogoClick?: () => void;
    onTemplatesOpen?: () => void;
  }) => (
    <div data-testid="app-shell">
      {onSignOut && <button onClick={onSignOut}>Sign Out</button>}
      {onLogoClick && <button onClick={onLogoClick}>Logo</button>}
      {onTemplatesOpen && <button onClick={onTemplatesOpen}>Templates</button>}
      {children}
    </div>
  ),
}));

vi.mock("../components/HistoryPanel.js", () => ({
  HistoryPanel: ({
    onSelect,
    onReplay,
    onToggleFavorite,
    onDelete,
  }: {
    onSelect: (id: string) => void;
    onReplay: (id: string) => void;
    onToggleFavorite: (id: string) => void;
    onDelete: (id: string) => void;
  }) => (
    <div data-testid="history-panel">
      <button onClick={() => onSelect("s1")}>Select s1</button>
      <button onClick={() => onReplay("s1")}>Replay s1</button>
      <button onClick={() => onToggleFavorite("s1")}>Fav s1</button>
      <button onClick={() => onDelete("s1")}>Delete s1</button>
    </div>
  ),
}));

vi.mock("../components/PreviewPane.js", () => ({
  PreviewPane: ({
    onRetry,
    onRefine,
    onToggleFullscreen,
    onShare,
  }: {
    onRetry?: () => void;
    onRefine?: () => void;
    onToggleFullscreen?: () => void;
    onShare?: (id: string) => void;
  }) => (
    <div data-testid="preview-pane">
      {onRetry && <button onClick={onRetry}>Retry</button>}
      {onRefine && <button onClick={onRefine}>Refine</button>}
      {onToggleFullscreen && <button onClick={onToggleFullscreen}>Fullscreen</button>}
      {onShare && <button onClick={() => onShare("s1")}>Share</button>}
    </div>
  ),
}));

vi.mock("../components/JsonInspector.js", () => ({
  JsonInspector: () => <div data-testid="json-inspector" />,
}));

vi.mock("../components/PromptBar.js", () => ({
  PromptBar: ({
    onSubmit,
    onStop,
    onExitRefinement,
  }: {
    onSubmit: (p: string) => void;
    onStop: () => void;
    onExitRefinement?: () => void;
  }) => (
    <div data-testid="prompt-bar">
      <button onClick={() => onSubmit("test prompt")}>Submit</button>
      <button onClick={onStop}>Stop</button>
      {onExitRefinement && <button onClick={onExitRefinement}>Exit Refine</button>}
    </div>
  ),
}));

vi.mock("../components/TemplateGallery.js", () => ({
  TemplateGallery: () => null,
}));

vi.mock("../components/KeyboardShortcuts.js", () => ({
  KeyboardShortcuts: () => null,
  HelpButton: () => null,
}));

import { PlaygroundPage } from "./PlaygroundPage.js";

describe("PlaygroundPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the three-column layout", () => {
    render(<PlaygroundPage />);
    expect(screen.getByTestId("app-shell")).toBeDefined();
    expect(screen.getByTestId("history-panel")).toBeDefined();
    expect(screen.getByTestId("preview-pane")).toBeDefined();
    expect(screen.getByTestId("json-inspector")).toBeDefined();
    expect(screen.getByTestId("prompt-bar")).toBeDefined();
  });

  it("submits a prompt via PromptBar", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Submit"));
    expect(mockSend).toHaveBeenCalledWith("test prompt");
  });

  it("stops streaming via PromptBar", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Stop"));
    expect(mockStop).toHaveBeenCalled();
  });

  it("selects a history entry", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Select s1"));
  });

  it("replays a history entry", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Replay s1"));
    expect(mockSend).toHaveBeenCalledWith("Dashboard");
  });

  it("toggles favorite on a history entry", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Fav s1"));
    expect(mockToggleFavorite).toHaveBeenCalledWith("s1");
  });

  it("deletes a history entry", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Delete s1"));
    expect(mockDeleteSpec).toHaveBeenCalledWith("s1");
  });

  it("signs out via AppShell", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Sign Out"));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("clicks logo to reset state", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Logo"));
  });

  it("opens templates gallery", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Templates"));
  });

  it("enters refinement mode via PreviewPane", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Refine"));
  });

  it("exits refinement mode via PromptBar", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Exit Refine"));
  });

  it("toggles fullscreen via PreviewPane", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Fullscreen"));
  });

  it("handles share from PreviewPane", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Share"));
  });
});
