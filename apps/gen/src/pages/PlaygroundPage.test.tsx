import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { PlaygroundSession } from "./usePlaygroundSession.js";

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

vi.mock("../contexts/ThemeContext.js", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: mockToggleTheme }),
}));

// AppShell now owns panel toggle state and exposes it via context. The mock
// provides the compound children and the useAppShellPanels hook the page reads.
vi.mock("../components/AppShell.js", () => {
  function AppShell({
    children,
    onSignOut,
    onLogoClick,
    onTemplatesOpen,
  }: {
    children: React.ReactNode;
    onSignOut?: () => void;
    onLogoClick?: () => void;
    onTemplatesOpen?: () => void;
  }) {
    return (
      <div data-testid="app-shell">
        {onSignOut && <button onClick={onSignOut}>Sign Out</button>}
        {onLogoClick && <button onClick={onLogoClick}>Logo</button>}
        {onTemplatesOpen && <button onClick={onTemplatesOpen}>Templates</button>}
        {children}
      </div>
    );
  }
  function HistoryRegion({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function InspectorRegion({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function CommandPalette() {
    return null;
  }
  AppShell.HistoryRegion = HistoryRegion;
  AppShell.InspectorRegion = InspectorRegion;
  AppShell.CommandPalette = CommandPalette;
  return {
    AppShell,
    useAppShellPanels: () => ({
      historyVisible: true,
      inspectorVisible: true,
      breakpoint: "desktop",
      toggleHistory: mockToggleHistory,
      toggleInspector: mockToggleInspector,
      closeOverlays: mockCloseOverlays,
      openPalette: vi.fn(),
      closePalette: vi.fn(),
    }),
  };
});

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

import { PlaygroundPage, PlaygroundBody } from "./PlaygroundPage.js";

function makeSession(overrides: Partial<PlaygroundSession> = {}): PlaygroundSession {
  return {
    mode: "generate",
    isFullscreen: false,
    galleryOpen: false,
    shortcutsOpen: false,
    toggleFullscreen: vi.fn(),
    openGallery: vi.fn(),
    closeGallery: vi.fn(),
    toggleGallery: vi.fn(),
    openShortcuts: vi.fn(),
    closeShortcuts: vi.fn(),
    toggleShortcuts: vi.fn(),
    exitRefinement: vi.fn(),
    specs: [],
    isLoading: false,
    filter: "all",
    setFilter: vi.fn(),
    isStreaming: false,
    error: null,
    displaySpec: null,
    displayRawLines: [],
    displayError: null,
    activeSpecId: null,
    submit: mockSend,
    refine: vi.fn(),
    replay: vi.fn(),
    retry: vi.fn(),
    selectHistory: vi.fn(),
    toggleFavorite: mockToggleFavorite,
    deleteSpec: mockDeleteSpec,
    reset: vi.fn(),
    stop: mockStop,
    ...overrides,
  };
}

describe("PlaygroundBody — session-object interface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with a single { session, onSignOut, toggleTheme } props shape", () => {
    render(
      <PlaygroundBody
        session={makeSession()}
        onSignOut={mockSignOut}
        toggleTheme={mockToggleTheme}
      />
    );
    expect(screen.getByTestId("prompt-bar")).toBeDefined();
    expect(screen.getByTestId("preview-pane")).toBeDefined();
    expect(screen.getByTestId("json-inspector")).toBeDefined();
  });

  it("delegates prompt submission directly to session.submit — no local choreography", () => {
    const session = makeSession();
    render(
      <PlaygroundBody session={session} onSignOut={mockSignOut} toggleTheme={mockToggleTheme} />
    );
    fireEvent.click(screen.getByText("Submit"));
    expect(session.submit).toHaveBeenCalledWith("test prompt");
  });

  it("delegates retry/refine to the session verbs", () => {
    const session = makeSession();
    render(
      <PlaygroundBody session={session} onSignOut={mockSignOut} toggleTheme={mockToggleTheme} />
    );
    fireEvent.click(screen.getByText("Retry"));
    expect(session.retry).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Refine"));
    expect(session.refine).toHaveBeenCalled();
  });
});

describe("PlaygroundPage — wiring", () => {
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

  it("submits a prompt via PromptBar through the session hook", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Submit"));
    expect(mockSend).toHaveBeenCalledWith("test prompt");
  });

  it("replays a history entry through the session hook", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Replay s1"));
    expect(mockSend).toHaveBeenCalledWith("Dashboard");
  });

  it("signs out via AppShell, resetting the session first", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Sign Out"));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("opens templates gallery", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Templates"));
  });
});
