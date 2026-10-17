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
 * Session-local undo/redo stacks of refinement diffs. It owns only the stacks:
 * the caller applies the returned diff to the displayed spec, so undo/redo
 * never call the model and never create history entries.
 */
export function useSpecDiffHistory(): UseSpecDiffHistoryReturn {
  const stacks = useRef<{ undo: SpecDiff[]; redo: SpecDiff[] }>({ undo: [], redo: [] });
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false });

  const sync = useCallback(() => {
    setFlags({
      canUndo: stacks.current.undo.length > 0,
      canRedo: stacks.current.redo.length > 0,
    });
  }, []);

  const push = useCallback(
    (diff: SpecDiff) => {
      stacks.current.undo.push(diff);
      stacks.current.redo = [];
      sync();
    },
    [sync]
  );

  const undo = useCallback((): SpecDiff | null => {
    const diff = stacks.current.undo.pop();
    if (!diff) return null;
    stacks.current.redo.push(diff);
    sync();
    return invertSpecDiff(diff);
  }, [sync]);

  const redo = useCallback((): SpecDiff | null => {
    const diff = stacks.current.redo.pop();
    if (!diff) return null;
    stacks.current.undo.push(diff);
    sync();
    return diff;
  }, [sync]);

  const clear = useCallback(() => {
    stacks.current = { undo: [], redo: [] };
    sync();
  }, [sync]);

  return { ...flags, push, undo, redo, clear };
}
