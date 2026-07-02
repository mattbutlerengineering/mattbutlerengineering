import { useCallback, useRef, useState } from "react";
import type { Spec } from "@json-render/react";
import { useGenStream } from "../hooks/useGenStream.js";
import { useSpecsApi } from "../hooks/useSpecsApi.js";
import { createRefinementPrompt } from "./createRefinementPrompt.js";
import { usePlaygroundState } from "./usePlaygroundState.js";
import type { PlaygroundMode } from "./usePlaygroundState.js";
import type { StoredSpec } from "../types.js";

export interface PlaygroundSession {
  // Render mode + transient overlays (passed through from usePlaygroundState)
  mode: PlaygroundMode;
  isFullscreen: boolean;
  galleryOpen: boolean;
  shortcutsOpen: boolean;
  toggleFullscreen: () => void;
  openGallery: () => void;
  closeGallery: () => void;
  toggleGallery: () => void;
  openShortcuts: () => void;
  closeShortcuts: () => void;
  toggleShortcuts: () => void;
  exitRefinement: () => void;

  // History (from useSpecsApi)
  specs: StoredSpec[];
  isLoading: boolean;
  filter: "all" | "favorites";
  setFilter: (filter: "all" | "favorites") => void;

  // Streaming + derived display state (from useGenStream)
  isStreaming: boolean;
  error: Error | null;
  displaySpec: Spec | null;
  displayRawLines: string[];
  displayError: Error | null;
  /** Set only when viewing a non-streaming saved entry (for Share/Refine). */
  activeSpecId: string | null;

  // Session verbs — own transition choreography lives here, not in the caller.
  submit: (prompt: string) => void;
  refine: () => void;
  replay: (id: string) => void;
  retry: () => void;
  selectHistory: (id: string) => void;
  toggleFavorite: (id: string) => void;
  deleteSpec: (id: string) => void;
  reset: () => void;
  stop: () => void;
}

/**
 * Owns the gen playground's generation session: which spec is on screen,
 * streaming vs. reviewing history, and the submit/refine/replay/retry/
 * selectHistory transitions between those states.
 *
 * Composes useGenStream (streaming) + useSpecsApi (history) +
 * usePlaygroundState (render mode / overlays) and derives the display state
 * from their outputs at render time — no effects involved in the derivation.
 */
export function usePlaygroundSession(): PlaygroundSession {
  const playgroundState = usePlaygroundState();
  const { mode, exitRefinement, enterRefinement } = playgroundState;

  const { specs, isLoading, saveSpec, toggleFavorite, deleteSpec } = useSpecsApi();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  // Track the most recently submitted prompt without triggering a re-render.
  const promptRef = useRef("");

  const { spec, isStreaming, error, rawLines, send, stop } = useGenStream({
    api: "/api/gen/ui",
    onComplete: (completedSpec, completedRawLines) => {
      void saveSpec({
        prompt: promptRef.current,
        spec: completedSpec,
        rawLines: completedRawLines,
      }).then((stored) => setActiveId(stored.id));
    },
  });

  const activeEntry = activeId ? specs.find((s) => s.id === activeId) : undefined;
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
  const activeSpecId = !isStreaming && activeId ? activeId : null;

  const resetTo = useCallback(
    (id: string | null) => {
      setActiveId(id);
      exitRefinement();
    },
    [exitRefinement]
  );

  const submit = useCallback(
    (prompt: string) => {
      if (mode === "refine" && displaySpec) {
        const refinementPrompt = createRefinementPrompt(displaySpec, prompt);
        promptRef.current = `Refined: ${prompt}`;
        setActiveId(null);
        void send(refinementPrompt);
      } else {
        promptRef.current = prompt;
        setActiveId(null);
        void send(prompt);
      }
    },
    [mode, displaySpec, send]
  );

  const replay = useCallback(
    (id: string) => {
      const entry = specs.find((s) => s.id === id);
      if (!entry) return;
      promptRef.current = entry.prompt;
      resetTo(null);
      void send(entry.prompt);
    },
    [specs, resetTo, send]
  );

  const retry = useCallback(() => {
    const retryPrompt = activeEntry?.prompt ?? promptRef.current;
    if (!retryPrompt) return;
    promptRef.current = retryPrompt;
    resetTo(null);
    void send(retryPrompt);
  }, [activeEntry, resetTo, send]);

  const selectHistory = useCallback(
    (id: string) => {
      if (isStreaming) return;
      resetTo(id);
    },
    [isStreaming, resetTo]
  );

  const reset = useCallback(() => resetTo(null), [resetTo]);

  const handleDeleteSpec = useCallback(
    (id: string) => {
      void deleteSpec(id);
      if (activeId === id) setActiveId(null);
    },
    [deleteSpec, activeId]
  );

  return {
    mode,
    isFullscreen: playgroundState.isFullscreen,
    galleryOpen: playgroundState.galleryOpen,
    shortcutsOpen: playgroundState.shortcutsOpen,
    toggleFullscreen: playgroundState.toggleFullscreen,
    openGallery: playgroundState.openGallery,
    closeGallery: playgroundState.closeGallery,
    toggleGallery: playgroundState.toggleGallery,
    openShortcuts: playgroundState.openShortcuts,
    closeShortcuts: playgroundState.closeShortcuts,
    toggleShortcuts: playgroundState.toggleShortcuts,
    exitRefinement,

    specs,
    isLoading,
    filter,
    setFilter,

    isStreaming,
    error,
    displaySpec,
    displayRawLines,
    displayError,
    activeSpecId,

    submit,
    refine: enterRefinement,
    replay,
    retry,
    selectHistory,
    toggleFavorite,
    deleteSpec: handleDeleteSpec,
    reset,
    stop,
  };
}
