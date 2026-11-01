import { useEffect, useSyncExternalStore } from "react";
import type { ChatFocus } from "../constants/chatPageContext.js";

/**
 * The record a page has open right now, for the chat (#7933). The Timeline keeps its
 * selection out of the URL on purpose (a reload or Back must not replay it), so the
 * chat can't read it from there: the page publishes it here instead. A module store,
 * not a context, because the chat's request context is built in DashboardLayout,
 * above the page that knows the selection.
 */
let current: ChatFocus | undefined;
const listeners = new Set<() => void>();

function publish(next: ChatFocus | undefined): void {
  if (current?.kind === next?.kind && current?.id === next?.id) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => current;

/** The record the open page has published, if any. */
export function useChatFocus(): ChatFocus | undefined {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Publish `focus` while the calling page is mounted; it clears on unmount. */
export function usePublishChatFocus(focus: ChatFocus | undefined): void {
  const kind = focus?.kind;
  const id = focus?.id;
  useEffect(() => {
    publish(kind && id ? { kind, id } : undefined);
    return () => publish(undefined);
  }, [kind, id]);
}
