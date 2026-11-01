import { useState } from "react";

/**
 * Decides whether a move away from an unsaved draft (close, Escape, another day) goes ahead
 * (ux.md F2 step 6). `dirty` is reported by the editor from its event handlers; a `request`
 * made while dirty is held in `pending` until the Manager answers Discard or Keep editing.
 * A form that can compare itself with where it started passes that as `derivedDirty` instead.
 */
export function useDiscardGuard<T>(apply: (next: T) => void, derivedDirty?: boolean) {
  const [reported, setDirty] = useState(false);
  const [pending, setPending] = useState<{ readonly next: T } | null>(null);
  const dirty = derivedDirty ?? reported;

  /** Moves on now, with the draft gone: after a save, or once it has been thrown away. */
  const release = (next: T) => {
    setDirty(false);
    setPending(null);
    apply(next);
  };

  return {
    dirty,
    setDirty,
    pending,
    request: (next: T) => (dirty ? setPending({ next }) : apply(next)),
    release,
    keepEditing: () => setPending(null),
    confirmDiscard: () => {
      if (pending) release(pending.next);
    },
  };
}
