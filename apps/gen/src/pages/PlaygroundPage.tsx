import { useState, useRef } from "react";
import { useAuth } from "@mbe/auth/react";
import type { Spec } from "@json-render/react";
import { useGenStream } from "../hooks/useGenStream.js";
import { useSpecsApi } from "../hooks/useSpecsApi.js";
import { AppShell } from "../components/AppShell.js";
import { HistoryPanel } from "../components/HistoryPanel.js";
import { PreviewPane } from "../components/PreviewPane.js";
import { JsonInspector } from "../components/JsonInspector.js";
import { PromptBar } from "../components/PromptBar.js";
import styles from "./PlaygroundPage.module.css";

/**
 * Main playground page.
 * Owns all state: streaming, active entry selection, history filter, refinement mode.
 * History is database-backed via useSpecsApi — survives page refresh.
 * Three-column layout: HistoryPanel | PreviewPane | JsonInspector
 * with AppShell wrapping the top bar and PromptBar at the bottom.
 *
 * Refinement mode: embeds the current spec as context in the /api/gen/ui
 * prompt so the model applies modifications without starting over.
 * Each refinement saves as a new entry in the database.
 */
export function PlaygroundPage() {
  const { signOut } = useAuth();
  const { specs, isLoading, saveSpec, toggleFavorite } = useSpecsApi();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [mode, setMode] = useState<"generate" | "refine">("generate");

  // Track the most recently submitted prompt without triggering re-renders
  const promptRef = useRef("");

  const { spec, isStreaming, error, rawLines, send, stop } = useGenStream({
    api: "/api/gen/ui",
    onComplete: (completedSpec, completedRawLines) => {
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

  // ---------------------------------------------------------------------------
  // Display logic — live streaming vs. history review mode
  // ---------------------------------------------------------------------------
  const activeEntry = activeId ? specs.find((s) => s.id === activeId) : null;
  // Cast spec from unknown to Spec — it's a valid Spec JSON object from the API
  const activeEntrySpec = activeEntry?.spec as Spec | undefined;
  const activeEntryRawLines = activeEntry?.rawLines ?? [];

  const displaySpec = isStreaming ? spec : (activeEntrySpec ?? spec);
  const displayRawLines = isStreaming ? rawLines : (activeEntryRawLines.length > 0 ? activeEntryRawLines : rawLines);
  const displayError = isStreaming ? error : null;

  // activeSpecId for Share/Refine: only set when viewing a non-streaming saved entry
  const activeSpecId = !isStreaming && activeId ? activeId : null;

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
  }

  function handleReplay(id: string) {
    const entry = specs.find((s) => s.id === id);
    if (!entry) return;
    promptRef.current = entry.prompt;
    setActiveId(null); // Switch to live streaming mode for new generation
    setMode("generate");
    void send(entry.prompt);
  }

  function handleToggleFavorite(id: string) {
    void toggleFavorite(id);
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

  function handleShare(_id: string) {
    // onShare is called after clipboard write in PreviewPane; no additional action needed here
  }

  return (
    <AppShell onSignOut={handleSignOut}>
      <div className={styles.layout}>
        <HistoryPanel
          entries={specs}
          activeId={activeId}
          filter={filter}
          isLoading={isLoading}
          onSelect={handleSelectHistory}
          onReplay={handleReplay}
          onToggleFavorite={handleToggleFavorite}
          onFilterChange={setFilter}
        />
        <PreviewPane
          spec={displaySpec}
          isStreaming={isStreaming}
          error={displayError}
          onRetry={handleRetry}
          activeSpecId={activeSpecId}
          onShare={handleShare}
          onRefine={handleEnterRefinement}
          isRefinementMode={mode === "refine"}
        />
        <JsonInspector rawLines={displayRawLines} isStreaming={isStreaming} />
      </div>
      <PromptBar
        onSubmit={handleSubmit}
        onStop={handleStop}
        isStreaming={isStreaming}
        disabled={false}
        mode={mode}
        onExitRefinement={handleExitRefinement}
      />
    </AppShell>
  );
}
