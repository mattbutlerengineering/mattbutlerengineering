import { useCallback, useEffect, useRef, useState } from "react";
import type { Spec } from "@json-render/react";
import { useGenStream } from "../hooks/useGenStream.js";
import { useSpecsApi } from "../hooks/useSpecsApi.js";
import { useSpecDiffHistory } from "../hooks/useSpecDiffHistory.js";
import { createRefinementPrompt } from "./createRefinementPrompt.js";
import { createErrorRecoveryPrompt } from "./createErrorRecoveryPrompt.js";
import { isTransportError } from "./classifyGenerationError.js";
import { usePlaygroundState } from "./usePlaygroundState.js";
import type { PlaygroundMode } from "./usePlaygroundState.js";
import { decodeSpec } from "../lib/spec.js";
import {
  ancestorChain,
  applySpecDiff,
  extractSubtree,
  spliceSubtree,
} from "../lib/spec-subtree.js";
import type { SpecError } from "../lib/spec-subtree.js";
import { validateSpecAgainstCatalog } from "../lib/validate-spec.js";
import { createSubtreeRefinementPrompt } from "./createSubtreeRefinementPrompt.js";
import { resolveEntry } from "../lib/entry-kind.js";
import type { EntryKind, StoredSpec } from "../types.js";
import type { SpecDiff } from "../lib/spec-subtree.js";

// A real, safely-renderable "empty" Spec — exactly what @json-render/react's
// own flatToTree([]) produces, and Renderer no-ops on it (`!spec.root`).
// Used as the placeholder for a failed attempt's spec: the `spec` column is
// NOT NULL, so this stands in for "no spec" without risking a render crash
// if the failed entry is ever selected from history.
const EMPTY_SPEC: Spec = { root: "", elements: {} };

const SPLICE_ERROR_MESSAGES: Record<SpecError, string> = {
  "unknown-key": "The selected component no longer exists in the spec.",
  "root-mismatch": "The regenerated subtree's root key does not match the selected component.",
  "key-collision": "The regenerated subtree reuses keys from elsewhere in the spec.",
};

/** A single-node refinement in flight: the spec it was made on and what was asked. */
interface NodeRefine {
  base: Spec;
  key: string;
  instruction: string;
  /** The saved entry the refined spec came from, null for an unsaved one. */
  parentId: string | null;
}

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
  /** Regenerate only the subtree at `key`, splice it into the displayed spec, and save the result. */
  refineNode: (key: string, instruction: string) => void;
  replay: (id: string) => void;
  retry: () => void;
  selectHistory: (id: string) => void;
  toggleFavorite: (id: string) => void;
  deleteSpec: (id: string) => void;
  /** Revert / re-apply the latest node refinement of this session; never calls the model. */
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The refinement most recently applied, undone or redone, for the before/after view. */
  lastChange: SpecDiff | null;
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
  /** Invoked with a short message when the session wants to tell the user something. */
  onNotice?: (message: string) => void;
}

export function usePlaygroundSession(options?: UsePlaygroundSessionOptions): PlaygroundSession {
  const playgroundState = usePlaygroundState();
  const { mode, exitRefinement, enterRefinement } = playgroundState;

  const { specs, isLoading, saveSpec, toggleFavorite, deleteSpec } = useSpecsApi();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  // Track the most recently submitted prompt without triggering a re-render.
  // `promptRef` holds the user's text saved to history; `kindRef` its kind.
  const promptRef = useRef("");
  const kindRef = useRef<EntryKind>("generate");
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

  // A node refine streams only a subtree, so the preview must keep showing the
  // spec it was made on — `pinnedSpec` overrides the stream-derived display
  // until the spliced result is saved (or the refine is abandoned). The ref
  // carries the same context into the stream callbacks and into retry().
  const [pinnedSpec, setPinnedSpec] = useState<Spec | null>(null);
  const [refineError, setRefineError] = useState<Error | null>(null);
  // Catalog-validation failure of a completed full generation (see onComplete).
  const [validationError, setValidationError] = useState<Error | null>(null);
  const nodeRefineRef = useRef<NodeRefine | null>(null);
  const savePendingRef = useRef(false);
  const diffHistory = useSpecDiffHistory();
  const { push: pushDiff, clear: clearDiffs } = diffHistory;
  const [lastChange, setLastChange] = useState<SpecDiff | null>(null);

  const { spec, isStreaming, error, rawLines, send, stop, clear } = useGenStream({
    api: "/api/gen/ui",
    onComplete: (completedSpec, completedRawLines) => {
      const nodeRefine = nodeRefineRef.current;
      let savedSpec = completedSpec;
      let refinement: SpecDiff | undefined;
      if (nodeRefine) {
        // Reject, never render, a subtree that can't be spliced or isn't in the catalog.
        const spliced = spliceSubtree(nodeRefine.base, nodeRefine.key, completedSpec);
        if (!spliced.ok) {
          setRefineError(new Error(SPLICE_ERROR_MESSAGES[spliced.error]));
          return;
        }
        const validation = validateSpecAgainstCatalog(spliced.spec);
        if (!validation.ok) {
          setRefineError(
            new Error(`The regenerated subtree is not valid Rialto: ${validation.message}`)
          );
          return;
        }
        savedSpec = spliced.spec;
        const before = extractSubtree(nodeRefine.base, nodeRefine.key);
        if (before) {
          refinement = {
            parentId: nodeRefine.parentId,
            path: nodeRefine.key,
            before,
            after: completedSpec,
          };
          pushDiff(refinement);
          setLastChange(refinement);
        }
        nodeRefineRef.current = null;
        setPinnedSpec(savedSpec);
      }
      if (!nodeRefine) {
        // A full generation is checked with the same validator as a refine.
        // Off-catalog elements would otherwise render as silent placeholders.
        // The streamed spec stays on screen (activeId stays null) next to the
        // error affordance, and the attempt is recorded as "failed" in history,
        // the same as a stream failure, rather than saved as a success.
        const validation = validateSpecAgainstCatalog(completedSpec);
        if (!validation.ok) {
          setValidationError(
            new Error(`The generated UI is not valid Rialto: ${validation.message}`)
          );
          void saveSpec({
            prompt: promptRef.current,
            kind: "failed",
            spec: EMPTY_SPEC,
            rawLines: [],
          }).catch((saveErr: unknown) => {
            console.error(
              "[usePlaygroundSession] Failed to record failed attempt in history:",
              saveErr
            );
          });
          return;
        }
      }
      options?.onGenerationComplete?.();
      // Undo/redo wait for the save: its late .then would otherwise overwrite them.
      savePendingRef.current = true;
      void saveSpec({
        prompt: promptRef.current,
        kind: kindRef.current,
        spec: savedSpec,
        rawLines: completedRawLines,
        refinement,
      })
        .then((stored) => {
          setActiveId(stored.id);
          setPinnedSpec(null);
        })
        .finally(() => {
          savePendingRef.current = false;
        });
    },
    // Record the failed attempt in the same history mechanism (kind
    // "failed") so a
    // failure -> success recovery is visible. Not selected as active —
    // that would null out displayError (see the derivation below) and hide
    // the error the user is meant to see and act on. Skipped for a
    // transport/HTTP failure (auth expired, network drop) — that's an
    // infrastructure hiccup, not a generation failure worth recording.
    onError: (err) => {
      if (!rawPrompt || isTransportError(err)) return;
      void saveSpec({
        prompt: rawPrompt,
        kind: "failed",
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
  const activeEntrySpec = activeEntry ? (decodeSpec(activeEntry.spec) ?? undefined) : undefined;
  const activeEntryRawLines = activeEntry?.rawLines ?? [];

  const displaySpec = pinnedSpec ?? (isStreaming ? spec : (activeEntrySpec ?? spec));
  const displayRawLines = isStreaming
    ? rawLines
    : activeEntryRawLines.length > 0
      ? activeEntryRawLines
      : rawLines;
  // useGenStream flips isStreaming to false in the same batch it sets error,
  // so gating on isStreaming here would mean the error is never visible —
  // only relevant while we're not looking at a previously saved entry.
  const displayError = activeId === null ? (refineError ?? validationError ?? error) : null;
  const activeSpecId = !isStreaming && activeId ? activeId : null;
  const failedPrompt = displayError ? rawPrompt : null;

  const clearNodeRefine = useCallback(() => {
    nodeRefineRef.current = null;
    setPinnedSpec(null);
    setRefineError(null);
    setValidationError(null);
    // A new spec makes the old diffs meaningless: they were made on the previous one.
    clearDiffs();
    setLastChange(null);
  }, [clearDiffs]);

  const resetTo = useCallback(
    (id: string | null) => {
      clearNodeRefine();
      setActiveId(id);
      exitRefinement();
    },
    [exitRefinement, clearNodeRefine]
  );

  const submit = useCallback(
    (prompt: string) => {
      setRawPrompt(prompt);
      clearNodeRefine();
      if (mode === "refine" && displaySpec) {
        refineSpecRef.current = displaySpec;
        const refinementPrompt = createRefinementPrompt(displaySpec, prompt);
        promptRef.current = prompt;
        kindRef.current = "refine";
        setActiveId(null);
        void send(refinementPrompt);
      } else {
        refineSpecRef.current = null;
        promptRef.current = prompt;
        kindRef.current = "generate";
        setActiveId(null);
        void send(prompt);
      }
    },
    [mode, displaySpec, send, clearNodeRefine]
  );

  const refineNode = useCallback(
    (key: string, instruction: string) => {
      if (!displaySpec) return;
      const subtree = extractSubtree(displaySpec, key);
      if (!subtree) return;
      const ancestors = ancestorChain(displaySpec, key);
      setRawPrompt(instruction);
      promptRef.current = instruction;
      kindRef.current = "refine";
      refineSpecRef.current = null;
      nodeRefineRef.current = { base: displaySpec, key, instruction, parentId: activeId };
      setPinnedSpec(displaySpec);
      setRefineError(null);
      setValidationError(null);
      setActiveId(null);
      void send(
        createSubtreeRefinementPrompt(subtree, ancestors, instruction),
        { subtree, ancestors },
        { target: { key, type: displaySpec.elements[key]?.type ?? "" } }
      );
    },
    [displaySpec, send, activeId]
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
    if (!initialPrompt) return;
    // Consume the param so a reload or sign-in round-trip doesn't regenerate.
    const params = new URLSearchParams(window.location.search);
    params.delete("prompt");
    const search = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`
    );
    queueMicrotask(() => submit(initialPrompt));
  }, [submit]);

  const replay = useCallback(
    (id: string) => {
      const entry = specs.find((s) => s.id === id);
      if (!entry) return;
      const { kind, prompt } = resolveEntry(entry);
      if (kind === "refine") {
        // A refine entry is replayed by re-applying its stored diff, never by
        // re-sending the bare instruction. Legacy entries carry no diff.
        const diff = entry.refinement;
        if (!diff) return;
        const parent = diff.parentId ? specs.find((s) => s.id === diff.parentId) : undefined;
        const parentSpec = parent ? decodeSpec(parent.spec) : null;
        let rebuilt = parentSpec ? applySpecDiff(parentSpec, diff) : null;
        if (!rebuilt?.ok) {
          // Parent evicted or deleted: the diff's `after` onto the entry's own spec.
          const ownSpec = decodeSpec(entry.spec);
          rebuilt = ownSpec ? applySpecDiff(ownSpec, diff) : null;
          if (!rebuilt?.ok) return;
          options?.onNotice?.("The original spec is gone; showing this refinement as saved.");
        }
        resetTo(null);
        setPinnedSpec(rebuilt.spec);
        return;
      }
      promptRef.current = prompt;
      kindRef.current = "generate";
      setRawPrompt(prompt);
      refineSpecRef.current = null;
      resetTo(null);
      void send(prompt);
    },
    [specs, resetTo, send, options]
  );

  // "Retry with error context": when the last attempt failed with a
  // generation/validation error, feed it back to the model instead of a
  // bare resubmit (reuses the same send() call — no new backend endpoint).
  // Always based on the untagged rawPrompt (or a selected entry's prompt),
  // so history labels can never leak into the model prompt. A refine failure's spec context
  // (refineSpecRef, captured at submit-time) is re-embedded so the retry
  // doesn't lose it. A transport failure (auth/network — see
  // isTransportError) isn't recoverable by feeding it back to the model, so
  // that case is just a bare resubmit, same as having no error at all.
  const retry = useCallback(() => {
    // A failed node refine is retried as a node refine on the same spec; a
    // whole-spec resubmit would replace the user's UI with a subtree.
    const nodeRefine = nodeRefineRef.current;
    if (nodeRefine) {
      refineNode(nodeRefine.key, nodeRefine.instruction);
      return;
    }
    const retryPrompt = activeEntry ? resolveEntry(activeEntry).prompt : rawPrompt;
    if (!retryPrompt) return;
    const recoverableError = validationError ?? (error && !isTransportError(error) ? error : null);
    setRawPrompt(retryPrompt);
    promptRef.current = retryPrompt;
    kindRef.current = recoverableError ? "recover" : "generate";
    resetTo(null);
    if (recoverableError) {
      const promptWithContext = refineSpecRef.current
        ? createRefinementPrompt(refineSpecRef.current, retryPrompt)
        : retryPrompt;
      void send(createErrorRecoveryPrompt(promptWithContext, recoverableError.message));
    } else {
      void send(retryPrompt);
    }
  }, [activeEntry, error, validationError, rawPrompt, resetTo, send, refineNode]);

  const applyDiff = useCallback(
    (diff: SpecDiff | null) => {
      if (!diff || !displaySpec) return;
      const applied = applySpecDiff(displaySpec, diff);
      if (!applied.ok) {
        // The stacks no longer match what is on screen; drop them rather than drift.
        clearDiffs();
        setLastChange(null);
        return;
      }
      setActiveId(null);
      setPinnedSpec(applied.spec);
      setLastChange(diff);
    },
    [displaySpec, clearDiffs]
  );
  const { undo: popUndo, redo: popRedo } = diffHistory;
  const undo = useCallback(() => {
    if (!isStreaming && !savePendingRef.current) applyDiff(popUndo());
  }, [isStreaming, applyDiff, popUndo]);
  const redo = useCallback(() => {
    if (!isStreaming && !savePendingRef.current) applyDiff(popRedo());
  }, [isStreaming, applyDiff, popRedo]);

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
    refineNode,
    replay,
    retry,
    selectHistory,
    toggleFavorite,
    deleteSpec: handleDeleteSpec,
    undo,
    redo,
    canUndo: diffHistory.canUndo,
    canRedo: diffHistory.canRedo,
    lastChange,
    reset,
    stop,
  };
}
