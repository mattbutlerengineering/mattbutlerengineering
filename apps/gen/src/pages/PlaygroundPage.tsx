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
 * Owns all state: streaming, active entry selection, history filter.
 * History is now database-backed via useSpecsApi — survives page refresh.
 * Three-column layout: HistoryPanel | PreviewPane | JsonInspector
 * with AppShell wrapping the top bar and PromptBar at the bottom.
 */
export function PlaygroundPage() {
  const { signOut } = useAuth();
  const { specs, isLoading, saveSpec, toggleFavorite } = useSpecsApi();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "favorites">("all");

  // Track the most recently submitted prompt without triggering re-renders
  const promptRef = useRef("");

  const { spec, isStreaming, error, rawLines, send, stop } = useGenStream({
    api: "/api/gen/ui",
    onComplete: (completedSpec, completedRawLines) => {
      // Auto-save completed generation to the database
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

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleSubmit(prompt: string) {
    promptRef.current = prompt;
    setActiveId(null); // Switch to live streaming mode
    void send(prompt);
  }

  function handleStop() {
    stop();
  }

  function handleSelectHistory(id: string) {
    if (isStreaming) return; // Don't allow switching while streaming
    setActiveId(id);
  }

  function handleReplay(id: string) {
    const entry = specs.find((s) => s.id === id);
    if (!entry) return;
    promptRef.current = entry.prompt;
    setActiveId(null); // Switch to live streaming mode for new generation
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
    void send(retryPrompt);
  }

  function handleSignOut() {
    setActiveId(null);
    void signOut();
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
        />
        <JsonInspector rawLines={displayRawLines} isStreaming={isStreaming} />
      </div>
      <PromptBar
        onSubmit={handleSubmit}
        onStop={handleStop}
        isStreaming={isStreaming}
        disabled={false}
      />
    </AppShell>
  );
}
