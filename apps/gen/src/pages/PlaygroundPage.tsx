import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { ErrorBoundary, useToast } from "@mattbutlerengineering/rialto";
import type { CommandItem } from "@mattbutlerengineering/rialto";
import type { Spec } from "@json-render/react";
import { useGenStream } from "../hooks/useGenStream.js";
import { useSpecsApi } from "../hooks/useSpecsApi.js";
import { useTheme } from "../contexts/ThemeContext.js";
import { AppShell, useAppShellPanels } from "../components/AppShell.js";
import { HistoryPanel } from "../components/HistoryPanel.js";
import { PreviewPane } from "../components/PreviewPane.js";
import { JsonInspector } from "../components/JsonInspector.js";
import { PromptBar } from "../components/PromptBar.js";
import { TemplateGallery } from "../components/TemplateGallery.js";
import { KeyboardShortcuts, HelpButton } from "../components/KeyboardShortcuts.js";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard.js";
import { downloadJson } from "../utils/downloadJson.js";
import { createRefinementPrompt } from "./createRefinementPrompt.js";
import { usePlaygroundState } from "./usePlaygroundState.js";
import type { PlaygroundState } from "./usePlaygroundState.js";
import type { StoredSpec } from "../types.js";
import styles from "./PlaygroundPage.module.css";

/**
 * Main playground page.
 * Owns all state: streaming, active entry selection, history filter, refinement mode.
 * History is database-backed via useSpecsApi — survives page refresh.
 * Three-column layout: HistoryPanel | PreviewPane | JsonInspector
 * with AppShell wrapping the top bar and PromptBar at the bottom.
 *
 * Panel open/close state (history / inspector / command palette) is owned by
 * AppShell; this page reads it through useAppShellPanels and composes the
 * AppShell.HistoryRegion / AppShell.InspectorRegion / AppShell.CommandPalette
 * compound children instead of threading toggle callbacks and paired flags.
 *
 * Responsive behavior:
 * - Desktop (>1024px): 3-column grid
 * - Tablet (768-1024px): 2-column (history hidden by default)
 * - Mobile (<768px): single column (panels shown as overlays)
 *
 * Refinement mode: embeds the current spec as context in the /api/gen/ui
 * prompt so the model applies modifications without starting over.
 * Each refinement saves as a new entry in the database.
 */
export function PlaygroundPage() {
  const { signOut } = useAuth();
  const { toast } = useToast();
  const { toggleTheme } = useTheme();
  const { specs, isLoading, saveSpec, toggleFavorite, deleteSpec } = useSpecsApi();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const playground = usePlaygroundState();
  const { isFullscreen, exitRefinement, openGallery, toggleGallery, toggleShortcuts } =
    playground;

  // Track the most recently submitted prompt without triggering re-renders
  const promptRef = useRef("");

  const { spec, isStreaming, error, rawLines, send, stop } = useGenStream({
    api: "/api/gen/ui",
    onComplete: (completedSpec, completedRawLines) => {
      toast({ title: "Generation complete", variant: "success", duration: 3000 });
      // Auto-save completed generation (or refinement) to the database
      void saveSpec({
        prompt: promptRef.current,
        spec: completedSpec,
        rawLines: completedRawLines,
      }).then((stored) => {
        setActiveId(stored.id);
      });
    },
  });

  // Show error toast when generation fails
  useEffect(() => {
    if (error) {
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "error",
        duration: 5000,
      });
    }
  }, [error, toast]);

  function handleSignOut() {
    setActiveId(null);
    exitRefinement();
    void signOut();
  }

  const handleLogoClick = useCallback(() => {
    setActiveId(null);
    exitRefinement();
  }, [exitRefinement]);

  function handleTemplatesOpen() {
    openGallery();
  }

  // Keyboard shortcut: Cmd+T / Ctrl+T to open template gallery
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "t") {
        e.preventDefault();
        toggleGallery();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggleGallery]);

  // Keyboard shortcut: "?" to open shortcuts help (only when no input is focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      toggleShortcuts();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggleShortcuts]);

  return (
    <AppShell
      isFullscreen={isFullscreen}
      onSignOut={handleSignOut}
      onLogoClick={handleLogoClick}
      onTemplatesOpen={handleTemplatesOpen}
    >
      <PlaygroundBody
        specs={specs}
        isLoading={isLoading}
        activeId={activeId}
        setActiveId={setActiveId}
        filter={filter}
        setFilter={setFilter}
        playground={playground}
        promptRef={promptRef}
        spec={spec}
        isStreaming={isStreaming}
        error={error}
        rawLines={rawLines}
        send={send}
        stop={stop}
        toggleFavorite={toggleFavorite}
        deleteSpec={deleteSpec}
        toggleTheme={toggleTheme}
        onSignOut={handleSignOut}
        toast={toast}
      />
    </AppShell>
  );
}

interface PlaygroundBodyProps {
  specs: StoredSpec[];
  isLoading: boolean;
  activeId: string | null;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  filter: "all" | "favorites";
  setFilter: React.Dispatch<React.SetStateAction<"all" | "favorites">>;
  playground: PlaygroundState;
  promptRef: React.MutableRefObject<string>;
  spec: Spec | null;
  isStreaming: boolean;
  error: Error | null;
  rawLines: string[];
  send: (prompt: string) => Promise<void> | void;
  stop: () => void;
  toggleFavorite: (id: string) => Promise<void>;
  deleteSpec: (id: string) => Promise<void>;
  toggleTheme: () => void;
  onSignOut: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}

/**
 * The playground content rendered inside AppShell. Reads shell-owned panel
 * state (history / inspector visibility, breakpoint, palette controls) via
 * useAppShellPanels and composes the AppShell panel regions + command palette.
 */
function PlaygroundBody({
  specs,
  isLoading,
  activeId,
  setActiveId,
  filter,
  setFilter,
  playground,
  promptRef,
  spec,
  isStreaming,
  error,
  rawLines,
  send,
  stop,
  toggleFavorite,
  deleteSpec,
  toggleTheme,
  onSignOut,
  toast,
}: PlaygroundBodyProps) {
  const {
    historyVisible,
    inspectorVisible,
    breakpoint,
    toggleHistory,
    toggleInspector,
    closeOverlays,
    closePalette,
  } = useAppShellPanels();

  const {
    mode,
    isFullscreen,
    galleryOpen,
    shortcutsOpen,
    enterRefinement,
    exitRefinement,
    toggleFullscreen,
    openGallery,
    closeGallery,
    openShortcuts,
    closeShortcuts,
  } = playground;

  const { copy } = useCopyToClipboard();
  const isMobileOrTablet = breakpoint !== "desktop";

  // ---------------------------------------------------------------------------
  // Display logic — live streaming vs. history review mode
  // ---------------------------------------------------------------------------
  const activeEntry = activeId ? specs.find((s) => s.id === activeId) : null;
  // Cast spec from unknown to Spec — it's a valid Spec JSON object from the API
  const activeEntrySpec = activeEntry?.spec as Spec | undefined;
  const activeEntryRawLines = activeEntry?.rawLines ?? [];

  const displaySpec = isStreaming ? spec : (activeEntrySpec ?? spec);
  const displayRawLines = isStreaming
    ? rawLines
    : activeEntryRawLines.length > 0
      ? activeEntryRawLines
      : rawLines;
  const displayError = isStreaming ? error : null;

  // activeSpecId for Share/Refine: only set when viewing a non-streaming saved entry
  const activeSpecId = !isStreaming && activeId ? activeId : null;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleSubmit(prompt: string) {
    if (mode === "refine" && displaySpec) {
      // Embed the current spec as context so the model modifies rather than regenerates
      const refinementPrompt = createRefinementPrompt(displaySpec, prompt);
      promptRef.current = `Refined: ${prompt}`;
      setActiveId(null); // Switch to live streaming mode
      void send(refinementPrompt);
    } else {
      promptRef.current = prompt;
      setActiveId(null); // Switch to live streaming mode
      void send(prompt);
    }
  }

  function handleStop() {
    stop();
  }

  function handleSelectHistory(id: string) {
    if (isStreaming) return; // Don't allow switching while streaming
    setActiveId(id);
    // Selecting from history exits refinement mode
    exitRefinement();
    // On mobile/tablet, close overlays after selection
    if (isMobileOrTablet) {
      closeOverlays();
    }
  }

  function handleReplay(id: string) {
    const entry = specs.find((s) => s.id === id);
    if (!entry) return;
    promptRef.current = entry.prompt;
    setActiveId(null); // Switch to live streaming mode for new generation
    exitRefinement();
    if (isMobileOrTablet) {
      closeOverlays();
    }
    void send(entry.prompt);
  }

  function handleToggleFavorite(id: string) {
    void toggleFavorite(id);
  }

  function handleDelete(id: string) {
    void deleteSpec(id);
    if (activeId === id) {
      setActiveId(null);
    }
  }

  function handleRetry() {
    const retryPrompt = activeEntry?.prompt ?? promptRef.current;
    if (!retryPrompt) return;
    promptRef.current = retryPrompt;
    setActiveId(null);
    exitRefinement();
    void send(retryPrompt);
  }

  function handleEnterRefinement() {
    enterRefinement();
  }

  function handleExitRefinement() {
    exitRefinement();
  }

  function handleToggleFullscreen() {
    toggleFullscreen();
  }

  function handleShare(_id: string) {
    // onShare is called after clipboard write in PreviewPane; no additional action needed here
  }

  function handleTemplateSelect(prompt: string) {
    toast({ title: "Generating from template...", variant: "accent", duration: 2000 });
    handleSubmit(prompt);
  }

  function handleGalleryClose() {
    closeGallery();
  }

  // ---------------------------------------------------------------------------
  // Command palette items
  // ---------------------------------------------------------------------------
  const commandItems: CommandItem[] = [
    {
      id: "new-generation",
      label: "New Generation",
      group: "Actions",
      shortcut: ["⌘", "N"],
      onSelect: () => {
        closePalette();
        setActiveId(null);
        exitRefinement();
      },
    },
    {
      id: "toggle-fullscreen",
      label: "Toggle Fullscreen",
      group: "Actions",
      shortcut: ["⌘", "F"],
      onSelect: () => {
        closePalette();
        toggleFullscreen();
      },
    },
    ...(isStreaming
      ? [
          {
            id: "stop-generation",
            label: "Stop Generation",
            group: "Actions",
            shortcut: ["Esc"],
            onSelect: () => {
              closePalette();
              stop();
            },
          },
        ]
      : []),
    {
      id: "open-templates",
      label: "Browse Templates",
      group: "Actions",
      shortcut: ["⌘", "T"],
      onSelect: () => {
        closePalette();
        openGallery();
      },
    },
    ...(displaySpec
      ? [
          {
            id: "export-spec",
            label: "Download Spec as JSON",
            group: "Export",
            onSelect: () => {
              closePalette();
              downloadJson(displaySpec);
            },
          },
          {
            id: "copy-spec-json",
            label: "Copy Spec JSON",
            group: "Export",
            onSelect: () => {
              closePalette();
              void copy(JSON.stringify(displaySpec, null, 2));
            },
          },
        ]
      : []),
    {
      id: "toggle-history",
      label: "Toggle History Panel",
      group: "Panels",
      shortcut: ["⌘", "1"],
      onSelect: () => {
        closePalette();
        toggleHistory();
      },
    },
    {
      id: "toggle-inspector",
      label: "Toggle JSON Inspector",
      group: "Panels",
      shortcut: ["⌘", "2"],
      onSelect: () => {
        closePalette();
        toggleInspector();
      },
    },
    {
      id: "keyboard-shortcuts",
      label: "Keyboard Shortcuts",
      group: "Settings",
      shortcut: ["?"],
      onSelect: () => {
        closePalette();
        openShortcuts();
      },
    },
    {
      id: "toggle-theme",
      label: "Toggle Theme",
      group: "Settings",
      onSelect: () => {
        closePalette();
        toggleTheme();
      },
    },
    {
      id: "sign-out",
      label: "Sign Out",
      group: "Settings",
      onSelect: () => {
        closePalette();
        onSignOut();
      },
    },
  ];

  // Build layout data attributes for CSS-driven responsive grid
  const layoutClassName = isFullscreen ? styles.layoutFullscreen : styles.layout;

  return (
    <>
      <div
        className={layoutClassName}
        data-history={historyVisible}
        data-inspector={inspectorVisible}
      >
        <AppShell.HistoryRegion>
          <HistoryPanel
            entries={specs}
            activeId={activeId}
            filter={filter}
            isLoading={isLoading}
            onSelect={handleSelectHistory}
            onReplay={handleReplay}
            onToggleFavorite={handleToggleFavorite}
            onDelete={handleDelete}
            onFilterChange={setFilter}
          />
        </AppShell.HistoryRegion>

        <ErrorBoundary
          fallback={
            <div style={{ padding: "var(--rialto-space-lg)", textAlign: "center" }}>
              {/* eslint-disable mbe-local/prefer-rialto-components -- rialto unavailable inside an ErrorBoundary fallback */}
              <p>Preview failed to render.</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  marginBlockStart: "var(--rialto-space-sm)",
                  padding: "var(--rialto-space-xs) var(--rialto-space-sm)",
                  borderRadius: "var(--rialto-radius-default)",
                  border: "1px solid var(--rialto-border)",
                  background: "var(--rialto-surface-elevated)",
                  color: "var(--rialto-text-primary)",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
              {/* eslint-enable mbe-local/prefer-rialto-components */}
            </div>
          }
        >
          <PreviewPane
            spec={displaySpec}
            isStreaming={isStreaming}
            error={displayError}
            onRetry={handleRetry}
            activeSpecId={activeSpecId}
            onShare={handleShare}
            onRefine={handleEnterRefinement}
            isRefinementMode={mode === "refine"}
            onSuggestionClick={handleSubmit}
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
          />
        </ErrorBoundary>

        <AppShell.InspectorRegion>
          <ErrorBoundary
            fallback={
              <div style={{ padding: "var(--rialto-space-lg)", textAlign: "center" }}>
                {/* eslint-disable mbe-local/prefer-rialto-components -- rialto unavailable inside an ErrorBoundary fallback */}
                <p>Inspector failed to render.</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  style={{
                    marginBlockStart: "var(--rialto-space-sm)",
                    padding: "var(--rialto-space-xs) var(--rialto-space-sm)",
                    borderRadius: "var(--rialto-radius-default)",
                    border: "1px solid var(--rialto-border)",
                    background: "var(--rialto-surface-elevated)",
                    color: "var(--rialto-text-primary)",
                    cursor: "pointer",
                  }}
                >
                  Retry
                </button>
                {/* eslint-enable mbe-local/prefer-rialto-components */}
              </div>
            }
          >
            <JsonInspector rawLines={displayRawLines} isStreaming={isStreaming} />
          </ErrorBoundary>
        </AppShell.InspectorRegion>
      </div>
      <PromptBar
        onSubmit={handleSubmit}
        onStop={handleStop}
        isStreaming={isStreaming}
        disabled={false}
        mode={mode}
        onExitRefinement={handleExitRefinement}
      />
      <TemplateGallery
        open={galleryOpen}
        onClose={handleGalleryClose}
        onSelect={handleTemplateSelect}
      />
      <KeyboardShortcuts open={shortcutsOpen} onClose={closeShortcuts} />
      <HelpButton onClick={openShortcuts} />
      <AppShell.CommandPalette items={commandItems} />
    </>
  );
}
