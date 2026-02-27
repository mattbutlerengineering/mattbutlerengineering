import { useState, useEffect, useRef, useCallback } from "react";
import type { SessionEvent } from "../types";
import { connectSessionEvents } from "../lib/api";

/**
 * Subscribes to SSE event streams for multiple sessions simultaneously
 * and merges all events into a single chronological list.
 */
export function useMultiSessionEvents(
  sessionIds: readonly string[],
  enabled: boolean
): { events: readonly SessionEvent[] } {
  const [events, setEvents] = useState<readonly SessionEvent[]>([]);
  const seenIds = useRef(new Set<string>());
  const disconnectsRef = useRef<Array<() => void>>([]);

  const handleEvent = useCallback((event: SessionEvent) => {
    if (seenIds.current.has(event.id)) return;
    seenIds.current.add(event.id);
    setEvents((prev) => [...prev, event]);
  }, []);

  // Stable key for the session ID set to avoid unnecessary reconnections
  const idsKey = sessionIds.slice().sort().join(",");

  useEffect(() => {
    if (!enabled || sessionIds.length === 0) {
      return;
    }

    // Clear previous state
    seenIds.current = new Set();

    // Connect to all sessions
    const disconnects = sessionIds.map((id) =>
      connectSessionEvents(id, handleEvent)
    );
    disconnectsRef.current = disconnects;

    return () => {
      for (const disconnect of disconnects) {
        disconnect();
      }
      disconnectsRef.current = [];
    };
  }, [idsKey, enabled, handleEvent, sessionIds]);

  return { events };
}
