import { useSyncExternalStore } from "react";

/**
 * Whether a day editor is open anywhere. Once an editor has pinned the version it will save
 * against, any other save (Copy, the nudge, an Undo) moves the version on and makes the
 * editor's own save conflict with the Manager's earlier one, so those wait until it is closed.
 */
let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Marks an editor open; the returned function marks it closed again (once). */
export function markEditorOpen(): () => void {
  openCount += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount -= 1;
    emit();
  };
}

export const isEditorOpen = (): boolean => openCount > 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useEditorOpen = (): boolean => useSyncExternalStore(subscribe, isEditorOpen);
