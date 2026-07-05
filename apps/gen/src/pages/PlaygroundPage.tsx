import { ErrorBoundary, useToast } from "@mattbutlerengineering/rialto";
import { AppShell, useAppShellPanels } from "../components/AppShell.js";
import { HistoryPanel } from "../components/HistoryPanel.js";
import { PreviewPane } from "../components/PreviewPane.js";
import { JsonInspector } from "../components/JsonInspector.js";
import { PromptBar } from "../components/PromptBar.js";
import { TemplateGallery } from "../components/TemplateGallery.js";
import { KeyboardShortcuts, HelpButton } from "../components/KeyboardShortcuts.js";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard.js";
import { usePlayground, buildPlaygroundCommandItems } from "../hooks/usePlayground.js";
import type { PlaygroundSession } from "./usePlaygroundSession.js";
import styles from "./PlaygroundPage.module.css";

/**
 * Workbench behaviour (the generation session, completion/error toasts, global
 * keyboard shortcuts, and shell-level callbacks) is owned by usePlayground, so
 * this component stays a thin view. Session state itself (streaming, active
 * entry, refinement mode, history) lives in usePlaygroundSession underneath it;
 * history is database-backed via useSpecsApi and survives page refresh.
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
  const { session, toggleTheme, onSignOut, onLogoClick, onTemplatesOpen } = usePlayground();

  return (
    <AppShell
      isFullscreen={session.isFullscreen}
      onSignOut={onSignOut}
      onLogoClick={onLogoClick}
      onTemplatesOpen={onTemplatesOpen}
    >
      <PlaygroundBody session={session} onSignOut={onSignOut} toggleTheme={toggleTheme} />
    </AppShell>
  );
}

interface PlaygroundBodyProps {
  session: PlaygroundSession;
  onSignOut: () => void;
  toggleTheme: () => void;
}

/**
 * The playground content rendered inside AppShell. Reads shell-owned panel
 * state (history / inspector visibility, breakpoint, palette controls) via
 * useAppShellPanels and composes the AppShell panel regions + command
 * palette. Session transitions (submit/refine/replay/retry/selectHistory)
 * are delegated to the session object — this component owns no choreography.
 */
export function PlaygroundBody({ session, onSignOut, toggleTheme }: PlaygroundBodyProps) {
  const {
    historyVisible,
    inspectorVisible,
    breakpoint,
    toggleHistory,
    toggleInspector,
    closeOverlays,
    closePalette,
  } = useAppShellPanels();
  const { toast } = useToast();
  const { copy } = useCopyToClipboard();
  const isMobileOrTablet = breakpoint !== "desktop";

  const {
    mode,
    isFullscreen,
    galleryOpen,
    shortcutsOpen,
    specs,
    isLoading,
    filter,
    setFilter,
    isStreaming,
    displaySpec,
    displayRawLines,
    displayError,
    activeSpecId,
    submit,
    refine,
    exitRefinement,
    replay,
    retry,
    selectHistory,
    toggleFavorite,
    deleteSpec,
    reset,
    stop,
    toggleFullscreen,
    closeGallery,
    openGallery,
    openShortcuts,
    closeShortcuts,
  } = session;

  // ---------------------------------------------------------------------------
  // Handlers — breakpoint-driven overlay closing is a shell concern, kept here.
  // ---------------------------------------------------------------------------

  function handleSelectHistory(id: string) {
    selectHistory(id);
    if (isMobileOrTablet) closeOverlays();
  }

  function handleReplay(id: string) {
    replay(id);
    if (isMobileOrTablet) closeOverlays();
  }

  function handleToggleFavorite(id: string) {
    toggleFavorite(id);
  }

  function handleShare(_id: string) {
    // onShare is called after clipboard write in PreviewPane; no additional action needed here
  }

  function handleTemplateSelect(prompt: string) {
    toast({ title: "Generating from template...", variant: "accent", duration: 2000 });
    submit(prompt);
  }

  // Command palette items are built by the pure buildPlaygroundCommandItems
  // helper (in usePlayground): it takes this body's session-derived state and
  // shell panel controls and returns the item array.
  const commandItems = buildPlaygroundCommandItems({
    isStreaming,
    displaySpec,
    reset,
    toggleFullscreen,
    stop,
    openGallery,
    openShortcuts,
    copy,
    toggleTheme,
    onSignOut,
    closePalette,
    toggleHistory,
    toggleInspector,
  });

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
            activeId={activeSpecId}
            filter={filter}
            isLoading={isLoading}
            onSelect={handleSelectHistory}
            onReplay={handleReplay}
            onToggleFavorite={handleToggleFavorite}
            onDelete={deleteSpec}
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
            onRetry={retry}
            activeSpecId={activeSpecId}
            onShare={handleShare}
            onRefine={refine}
            isRefinementMode={mode === "refine"}
            onSuggestionClick={submit}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
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
        onSubmit={submit}
        onStop={stop}
        isStreaming={isStreaming}
        disabled={false}
        mode={mode}
        onExitRefinement={exitRefinement}
      />
      <TemplateGallery open={galleryOpen} onClose={closeGallery} onSelect={handleTemplateSelect} />
      <KeyboardShortcuts open={shortcutsOpen} onClose={closeShortcuts} />
      <HelpButton onClick={openShortcuts} />
      <AppShell.CommandPalette items={commandItems} />
    </>
  );
}
