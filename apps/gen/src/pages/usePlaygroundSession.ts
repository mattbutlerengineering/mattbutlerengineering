import { useCallback, useEffect, useRef, useState } from "react";
import type { Spec } from "@json-render/react";
import { useGenStream } from "../hooks/useGenStream.js";
import { useSpecsApi } from "../hooks/useSpecsApi.js";
import { createRefinementPrompt } from "./createRefinementPrompt.js";
import { createErrorRecoveryPrompt } from "./createErrorRecoveryPrompt.js";
import { isTransportError } from "./classifyGenerationError.js";
import { usePlaygroundState } from "./usePlaygroundState.js";
import type { PlaygroundMode } from "./usePlaygroundState.js";
import type { StoredSpec } from "../types.js";

// A real, safely-renderable "empty" Spec — exactly what @json-render/react's
// own flatToTree([]) produces, and Renderer no-ops on it (`!spec.root`).
// Used as the placeholder for a failed attempt's spec: the `spec` column is
// NOT NULL, so this stands in for "no spec" without risking a render crash
// if the failed entry is ever selected from history.
const EMPTY_SPEC: Spec = { root: "", elements: {} };

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
  /** The raw prompt behind the current displayError, so it can be restored
   *  into the prompt input for editing instead of being lost. */
  failedPrompt: string | null;

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
export interface UsePlaygroundSessionOptions {
  /**
   * Invoked when a generation (or refinement) stream completes, before the
   * result is auto-saved. Callers own how completion is surfaced (e.g. a
   * toast) — the hook itself stays UI-agnostic.
   */
  onGenerationComplete?: () => void;
}

export function usePlaygroundSession(options?: UsePlaygroundSessionOptions): PlaygroundSession {
  const playgroundState = usePlaygroundState();
  const { mode, exitRefinement, enterRefinement } = playgroundState;

  const { specs, isLoading, saveSpec, toggleFavorite, deleteSpec } = useSpecsApi();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  // Track the most recently submitted prompt without triggering a re-render.
  // `promptRef` holds the string saved to history (tagged "Refined:"/
  // "Recovered:" per the existing convention).
  const promptRef = useRef("");
  // The exact user-entered text (untagged), so a failure can restore it for
  // editing (`failedPrompt` below). State, not a ref — it's read during
  // render, and react-hooks/refs forbids reading ref.current at render time.
  const [rawPrompt, setRawPrompt] = useState("");
  // The spec being refined at submit-time, captured because useGenStream's
  // own send() resets its reactive `spec` to null at request start — so by
  // the time a refine attempt has failed, displaySpec is already gone and
  // retry() would otherwise lose the refinement context. Only relevant, and
  // only read, on the error-context retry path.
  const refineSpecRef = useRef<Spec | null>(null);

  const { spec, isStreaming, error, rawLines, send, stop, clear } = useGenStream({
    api: "/api/gen/ui",
    onComplete: (completedSpec, completedRawLines) => {
      options?.onGenerationComplete?.();
      void saveSpec({
        prompt: promptRef.current,
        spec: completedSpec,
        rawLines: completedRawLines,
      }).then((stored) => setActiveId(stored.id));
    },
    // Record the failed attempt in the same history mechanism (tagged
    // "Failed:", following the existing "Refined:" convention) so a
    // failure -> success recovery is visible. Not selected as active —
    // that would null out displayError (see the derivation below) and hide
    // the error the user is meant to see and act on. Skipped for a
    // transport/HTTP failure (auth expired, network drop) — that's an
    // infrastructure hiccup, not a generation failure worth recording.
    onError: (err) => {
      if (!rawPrompt || isTransportError(err)) return;
      void saveSpec({
        prompt: `Failed: ${rawPrompt}`,
        spec: EMPTY_SPEC,
        rawLines: [],
      }).catch((saveErr: unknown) => {
        console.error(
          "[usePlaygroundSession] Failed to record failed attempt in history:",
          saveErr
        );
      });
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
  // useGenStream flips isStreaming to false in the same batch it sets error,
  // so gating on isStreaming here would mean the error is never visible —
  // only relevant while we're not looking at a previously saved entry.
  const displayError = activeId === null ? error : null;
  const activeSpecId = !isStreaming && activeId ? activeId : null;
  const failedPrompt = displayError ? rawPrompt : null;

  const resetTo = useCallback(
    (id: string | null) => {
      setActiveId(id);
      exitRefinement();
    },
    [exitRefinement]
  );

  const submit = useCallback(
    (prompt: string) => {
      setRawPrompt(prompt);
      if (mode === "refine" && displaySpec) {
        refineSpecRef.current = displaySpec;
        const refinementPrompt = createRefinementPrompt(displaySpec, prompt);
        promptRef.current = `Refined: ${prompt}`;
        setActiveId(null);
        void send(refinementPrompt);
      } else {
        refineSpecRef.current = null;
        promptRef.current = prompt;
        setActiveId(null);
        void send(prompt);
      }
    },
    [mode, displaySpec, send]
  );

  // Pre-load a deep-linked prompt (e.g. from the marketing site's playground
  // link: `/gen/?prompt=<text>`) by submitting it once on mount. Guarded by a
  // ref rather than an empty dependency array so it still fires exactly once
  // even though `submit` is recreated whenever `mode`/`displaySpec`/`send`
  // change. Absent or blank param -> no-op, identical to today's behavior.
  // `submit` itself calls setState, so — like useSpecsApi's mount-fetch above
  // it — the call is deferred to a microtask to avoid a synchronous setState
  // inside the effect body (react-hooks/set-state-in-effect).
  const initialPromptHandledRef = useRef(false);
  useEffect(() => {
    if (initialPromptHandledRef.current) return;
    initialPromptHandledRef.current = true;
    const initialPrompt = new URLSearchParams(window.location.search).get("prompt")?.trim();
    if (initialPrompt) queueMicrotask(() => submit(initialPrompt));
  }, [submit]);

  const replay = useCallback(
    (id: string) => {
      const entry = specs.find((s) => s.id === id);
      if (!entry) return;
      promptRef.current = entry.prompt;
      setRawPrompt(entry.prompt);
      refineSpecRef.current = null;
      resetTo(null);
      void send(entry.prompt);
    },
    [specs, resetTo, send]
  );

  // "Retry with error context": when the last attempt failed with a
  // generation/validation error, feed it back to the model instead of a
  // bare resubmit (reuses the same send() call — no new backend endpoint).
  // Always based on the untagged rawPrompt (or a selected entry's prompt) —
  // never on promptRef.current, which carries the "Refined:"/"Recovered:"
  // history label — so repeated retries can't pile tags onto each other or
  // leak them into the model prompt. A refine failure's spec context
  // (refineSpecRef, captured at submit-time) is re-embedded so the retry
  // doesn't lose it. A transport failure (auth/network — see
  // isTransportError) isn't recoverable by feeding it back to the model, so
  // that case is just a bare resubmit, same as having no error at all.
  const retry = useCallback(() => {
    const retryPrompt = activeEntry?.prompt ?? rawPrompt;
    if (!retryPrompt) return;
    const recoverableError = error && !isTransportError(error) ? error : null;
    setRawPrompt(retryPrompt);
    promptRef.current = recoverableError ? `Recovered: ${retryPrompt}` : retryPrompt;
    resetTo(null);
    if (recoverableError) {
      const promptWithContext = refineSpecRef.current
        ? createRefinementPrompt(refineSpecRef.current, retryPrompt)
        : retryPrompt;
      void send(createErrorRecoveryPrompt(promptWithContext, recoverableError.message));
    } else {
      void send(retryPrompt);
    }
  }, [activeEntry, error, rawPrompt, resetTo, send]);

  const selectHistory = useCallback(
    (id: string) => {
      if (isStreaming) return;
      resetTo(id);
    },
    [isStreaming, resetTo]
  );

  // Clear the underlying error/spec/rawLines too, not just activeId/mode —
  // otherwise displayError stays set (activeId is already null in the
  // common case, so resetTo(null) alone is a no-op for it) and the logo
  // click / sign-out "New Generation" action doesn't show the empty state.
  const reset = useCallback(() => {
    clear();
    resetTo(null);
  }, [clear, resetTo]);

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
    failedPrompt,

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
