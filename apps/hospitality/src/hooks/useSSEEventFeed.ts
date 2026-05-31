/**
 * useSSEEventFeed
 *
 * Subscribes to raw SSE reservation events broadcast by useReservationQuerySync.
 * This replaces the `subscribeToEvents` pattern from ReservationDataContext.
 *
 * Usage:
 *   const events = useSSEEventFeed({ maxItems: 5 });
 */

import { useState, useEffect } from "react";
import type { ReservationEvent } from "./useReservationEvents.js";

type EventFeedListener = (event: ReservationEvent) => void;

const _feedListeners = new Set<EventFeedListener>();

/** Called by useReservationQuerySync to broadcast raw events. */
export function broadcastSSEEvent(event: ReservationEvent): void {
  for (const listener of _feedListeners) {
    listener(event);
  }
}

export interface UseSSEEventFeedOptions {
  maxItems?: number;
}

export function useSSEEventFeed(options: UseSSEEventFeedOptions = {}): readonly ReservationEvent[] {
  const { maxItems = 5 } = options;
  const [events, setEvents] = useState<readonly ReservationEvent[]>([]);

  useEffect(() => {
    const listener: EventFeedListener = (event) => {
      setEvents((prev) => [event, ...prev].slice(0, maxItems));
    };
    _feedListeners.add(listener);
    return () => {
      _feedListeners.delete(listener);
    };
  }, [maxItems]);

  return events;
}
