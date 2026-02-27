import { useState, useEffect, useRef, useCallback } from "react";
import type { SessionEvent } from "../types";
import { connectSessionEvents } from "../lib/api";

interface UseSessionEventsResult {
  readonly events: readonly SessionEvent[];
}

export function useSessionEvents(
  sessionId: string | null,
  enabled: boolean
): UseSessionEventsResult {
  const [events, setEvents] = useState<readonly SessionEvent[]>([]);
  const seenIds = useRef(new Set<string>());

  const handleEvent = useCallback((event: SessionEvent) => {
    if (seenIds.current.has(event.id)) return;
    seenIds.current.add(event.id);
    setEvents((prev) => [...prev, event]);
  }, []);

  useEffect(() => {
    if (!sessionId || !enabled) {
      return;
    }

    // Clear dedup set for new session
    seenIds.current = new Set();

    const disconnect = connectSessionEvents(
      sessionId,
      // First event for a new session resets the list
      (event) => {
        if (seenIds.current.size === 0) {
          seenIds.current.add(event.id);
          setEvents([event]);
        } else {
          handleEvent(event);
        }
      }
    );

    return () => {
      disconnect();
    };
  }, [sessionId, enabled, handleEvent]);

  return { events };
}
