import { useCallback, useRef, useState } from "react";
import { invertSpecDiff } from "../lib/spec-subtree.js";
import type { SpecDiff } from "../lib/spec-subtree.js";

export interface UseSpecDiffHistoryReturn {
  canUndo: boolean;
  canRedo: boolean;
  /** Record a refinement just applied; drops anything that could have been redone. */
  push: (diff: SpecDiff) => void;
  /** The diff that reverts the latest refinement, or null when there is nothing to undo. */
  undo: () => SpecDiff | null;
  /** The diff that re-applies the latest undone refinement, or null. */
  redo: () => SpecDiff | null;
  clear: () => void;
}

/**
 * Session-local undo/redo stacksRef of refinement diffs. It owns only the stacksRef:
 * the caller applies the returned diff to the displayed spec, so undo/redo
 * never call the model and never create history entries.
 */
export function useSpecDiffHistory(): UseSpecDiffHistoryReturn {
  const stacksRef = useRef<{ undo: SpecDiff[]; redo: SpecDiff[] }>({ undo: [], redo: [] });
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false });

  const sync = useCallback(() => {
    setFlags({
      canUndo: stacksRef.current.undo.length > 0,
      canRedo: stacksRef.current.redo.length > 0,
    });
  }, []);

  const push = useCallback(
    (diff: SpecDiff) => {
      stacksRef.current.undo.push(diff);
      stacksRef.current.redo = [];
      sync();
    },
    [sync]
  );

  const undo = useCallback((): SpecDiff | null => {
    const diff = stacksRef.current.undo.pop();
    if (!diff) return null;
    stacksRef.current.redo.push(diff);
    sync();
    return invertSpecDiff(diff);
  }, [sync]);

  const redo = useCallback((): SpecDiff | null => {
    const diff = stacksRef.current.redo.pop();
    if (!diff) return null;
    stacksRef.current.undo.push(diff);
    sync();
    return diff;
  }, [sync]);

  const clear = useCallback(() => {
    stacksRef.current = { undo: [], redo: [] };
    sync();
  }, [sync]);

  return { ...flags, push, undo, redo, clear };
}
