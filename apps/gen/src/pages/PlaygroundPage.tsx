import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { ErrorBoundary, useToast } from "@mbe/rialto";
import type { CommandItem } from "@mbe/rialto";
import type { Spec } from "@json-render/react";
import { useGenStream } from "../hooks/useGenStream.js";
import { useSpecsApi } from "../hooks/useSpecsApi.js";
import { usePanelLayout } from "../hooks/usePanelLayout.js";
import { useTheme } from "../contexts/ThemeContext.js";
import { AppShell } from "../components/AppShell.js";
import { HistoryPanel } from "../components/HistoryPanel.js";
import { PreviewPane } from "../components/PreviewPane.js";
import { JsonInspector } from "../components/JsonInspector.js";
import { PromptBar } from "../components/PromptBar.js";
import { TemplateGallery } from "../components/TemplateGallery.js";
import { KeyboardShortcuts, HelpButton } from "../components/KeyboardShortcuts.js";
import styles from "./PlaygroundPage.module.css";

/**
 * Main playground page.
 * Owns all state: streaming, active entry selection, history filter, refinement mode.
 * History is database-backed via useSpecsApi — survives page refresh.
 * Three-column layout: HistoryPanel | PreviewPane | JsonInspector
 * with AppShell wrapping the top bar and PromptBar at the bottom.
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
  const {
    historyVisible,
    inspectorVisible,
    breakpoint,
    toggleHistory,
    toggleInspector,
    closeOverlays,
  } = usePanelLayout();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [mode, setMode] = useState<"generate" | "refine">("generate");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

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
      toast({ title: "Generation failed", description: error.message, variant: "error", duration: 5000 });
    }
  }, [error, toast]);

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

  const isMobileOrTablet = breakpoint !== "desktop";

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleSubmit(prompt: string) {
    if (mode === "refine" && displaySpec) {
      // Embed the current spec as context so the model modifies rather than regenerates
      const refinementPrompt =
        `Here is an existing UI spec generated from Rialto components. ` +
        `Please modify it according to the user's instruction. ` +
        `Output the COMPLETE modified spec (not just the changes).\n\n` +
        `Existing spec:\n${JSON.stringify(displaySpec)}\n\n` +
        `Modification requested: ${prompt}`;
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
    setMode("generate");
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
    setMode("generate");
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
    setMode("generate");
    void send(retryPrompt);
  }

  function handleSignOut() {
    setActiveId(null);
    setMode("generate");
    void signOut();
  }

  function handleEnterRefinement() {
    setMode("refine");
  }

  function handleExitRefinement() {
    setMode("generate");
  }

  function handleToggleFullscreen() {
    setIsFullscreen((prev) => !prev);
  }

  function handleShare(_id: string) {
    // onShare is called after clipboard write in PreviewPane; no additional action needed here
  }

  const handleLogoClick = useCallback(() => {
    setActiveId(null);
    setMode("generate");
  }, []);

  function handleTemplateSelect(prompt: string) {
    toast({ title: "Generating from template...", variant: "accent", duration: 2000 });
    handleSubmit(prompt);
  }

  function handleTemplatesOpen() {
    setGalleryOpen(true);
  }

  function handleGalleryClose() {
    setGalleryOpen(false);
  }

  // Keyboard shortcut: Cmd+T / Ctrl+T to open template gallery
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "t") {
        e.preventDefault();
        setGalleryOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Keyboard shortcut: "?" to open shortcuts help (only when no input is focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      setShortcutsOpen((prev) => !prev);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ---------------------------------------------------------------------------
  // Command palette items
  // ---------------------------------------------------------------------------
  const commandItems: CommandItem[] = [
    {
      id: "new-generation",
      label: "New Generation",
      group: "Actions",
      shortcut: ["\u2318", "N"],
      onSelect: () => {
        setPaletteOpen(false);
        setActiveId(null);
        setMode("generate");
      },
    },
    {
      id: "toggle-fullscreen",
      label: "Toggle Fullscreen",
      group: "Actions",
      shortcut: ["\u2318", "F"],
      onSelect: () => {
        setPaletteOpen(false);
        setIsFullscreen((prev) => !prev);
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
              setPaletteOpen(false);
              stop();
            },
          },
        ]
      : []),
    {
      id: "open-templates",
      label: "Browse Templates",
      group: "Actions",
      shortcut: ["\u2318", "T"],
      onSelect: () => {
        setPaletteOpen(false);
        setGalleryOpen(true);
      },
    },
    ...(displaySpec
      ? [
          {
            id: "export-spec",
            label: "Download Spec as JSON",
            group: "Export",
            onSelect: () => {
              setPaletteOpen(false);
              const json = JSON.stringify(displaySpec, null, 2);
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `gen-spec-${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
            },
          },
          {
            id: "copy-spec-json",
            label: "Copy Spec JSON",
            group: "Export",
            onSelect: () => {
              setPaletteOpen(false);
              const json = JSON.stringify(displaySpec, null, 2);
              void navigator.clipboard.writeText(json);
            },
          },
        ]
      : []),
    {
      id: "toggle-history",
      label: "Toggle History Panel",
      group: "Panels",
      shortcut: ["\u2318", "1"],
      onSelect: () => {
        setPaletteOpen(false);
        toggleHistory();
      },
    },
    {
      id: "toggle-inspector",
      label: "Toggle JSON Inspector",
      group: "Panels",
      shortcut: ["\u2318", "2"],
      onSelect: () => {
        setPaletteOpen(false);
        toggleInspector();
      },
    },
    {
      id: "keyboard-shortcuts",
      label: "Keyboard Shortcuts",
      group: "Settings",
      shortcut: ["?"],
      onSelect: () => {
        setPaletteOpen(false);
        setShortcutsOpen(true);
      },
    },
    {
      id: "toggle-theme",
      label: "Toggle Theme",
      group: "Settings",
      onSelect: () => {
        setPaletteOpen(false);
        toggleTheme();
      },
    },
    {
      id: "sign-out",
      label: "Sign Out",
      group: "Settings",
      onSelect: () => {
        setPaletteOpen(false);
        handleSignOut();
      },
    },
  ];

  // Build layout data attributes for CSS-driven responsive grid
  const layoutClassName = isFullscreen ? styles.layoutFullscreen : styles.layout;
  const showHistoryPanel = !isFullscreen && historyVisible;
  const showInspectorPanel = !isFullscreen && inspectorVisible;

  return (
    <AppShell
      onSignOut={handleSignOut}
      historyVisible={historyVisible}
      inspectorVisible={inspectorVisible}
      onToggleHistory={toggleHistory}
      onToggleInspector={toggleInspector}
      onLogoClick={handleLogoClick}
      onTemplatesOpen={handleTemplatesOpen}
      paletteOpen={paletteOpen}
      onPaletteOpenChange={setPaletteOpen}
      commandItems={commandItems}
    >
      <div
        className={layoutClassName}
        data-history={historyVisible}
        data-inspector={inspectorVisible}
      >
        {/* Backdrop for mobile/tablet overlays */}
        {isMobileOrTablet && (showHistoryPanel || showInspectorPanel) && (
          <div
            className={styles.backdrop}
            onClick={closeOverlays}
            aria-hidden="true"
          />
        )}

        {showHistoryPanel && (
          <div
            className={
              isMobileOrTablet
                ? `${styles.overlayPanel} ${styles.overlayStart}`
                : styles.sidePanel
            }
          >
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
          </div>
        )}

        <ErrorBoundary
          fallback={
            <div style={{ padding: "var(--rialto-space-lg)", textAlign: "center" }}>
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

        {showInspectorPanel && (
          <div
            className={
              isMobileOrTablet
                ? `${styles.overlayPanel} ${styles.overlayEnd}`
                : styles.sidePanel
            }
          >
            <ErrorBoundary
              fallback={
                <div style={{ padding: "var(--rialto-space-lg)", textAlign: "center" }}>
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
                </div>
              }
            >
              <JsonInspector rawLines={displayRawLines} isStreaming={isStreaming} />
            </ErrorBoundary>
          </div>
        )}
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
      <KeyboardShortcuts
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <HelpButton onClick={() => setShortcutsOpen(true)} />
    </AppShell>
  );
}
