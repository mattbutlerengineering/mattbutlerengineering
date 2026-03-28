import { useState, useRef, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { useGenStream } from "../hooks/useGenStream.js";
import type { HistoryEntry } from "../types.js";
import { AppShell } from "../components/AppShell.js";
import { HistoryPanel } from "../components/HistoryPanel.js";
import { PreviewPane } from "../components/PreviewPane.js";
import { JsonInspector } from "../components/JsonInspector.js";
import { PromptBar } from "../components/PromptBar.js";
import styles from "./PlaygroundPage.module.css";

/**
 * Main playground page.
 * Owns all state: streaming, history, active entry selection.
 * Three-column layout: HistoryPanel | PreviewPane | JsonInspector
 * with AppShell wrapping the top bar and PromptBar at the bottom.
 */
export function PlaygroundPage() {
  const { signOut } = useAuth();

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Track the most recently submitted prompt without triggering re-renders
  const promptRef = useRef("");
  // Keep rawLines accessible in onComplete without stale closure
  const rawLinesRef = useRef<string[]>([]);

  const { spec, isStreaming, error, rawLines, send, stop } = useGenStream({
    api: "/api/gen/ui",
    onComplete: (completedSpec) => {
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        prompt: promptRef.current,
        spec: completedSpec,
        rawLines: [...rawLinesRef.current],
        timestamp: new Date(),
      };
      setHistory((prev) => [entry, ...prev].slice(0, 50));
      setActiveId(entry.id);
    },
  });

  // Keep rawLinesRef in sync after each render so onComplete sees current rawLines
  useEffect(() => {
    rawLinesRef.current = rawLines;
  });

  // ---------------------------------------------------------------------------
  // Display logic — live streaming vs. history review mode
  // ---------------------------------------------------------------------------
  const activeEntry = activeId ? history.find((e) => e.id === activeId) : null;
  const displaySpec = isStreaming ? spec : (activeEntry?.spec ?? spec);
  const displayRawLines = isStreaming ? rawLines : (activeEntry?.rawLines ?? rawLines);
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

  function handleRetry() {
    const retryPrompt = activeEntry?.prompt ?? promptRef.current;
    if (!retryPrompt) return;
    promptRef.current = retryPrompt;
    setActiveId(null);
    void send(retryPrompt);
  }

  function handleSignOut() {
    setHistory([]);
    setActiveId(null);
    void signOut();
  }

  return (
    <AppShell onSignOut={handleSignOut}>
      <div className={styles.layout}>
        <HistoryPanel
          entries={history}
          activeId={activeId}
          onSelect={handleSelectHistory}
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
