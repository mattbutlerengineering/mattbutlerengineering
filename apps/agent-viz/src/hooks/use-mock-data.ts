import { useState, useEffect, useRef } from "react";
import type { Session, SessionTree, SessionEvent } from "../types";
import { MOCK_SESSIONS, createMockEventStream } from "../lib/mock-data";

interface UseMockDataResult {
  readonly sessions: readonly Session[];
  readonly trees: readonly SessionTree[];
  readonly events: readonly SessionEvent[];
  readonly loading: boolean;
}

export function useMockData(): UseMockDataResult {
  const [sessions] = useState<readonly Session[]>(MOCK_SESSIONS);
  const [events, setEvents] = useState<readonly SessionEvent[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Start emitting mock events for the "running" child session
    const runningSession = MOCK_SESSIONS.find((s) => s.status === "running" && s.parentId);
    if (!runningSession) return;

    cleanupRef.current = createMockEventStream(runningSession.id, (event) => {
      setEvents((prev) => [...prev, event]);
    });

    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const trees: readonly SessionTree[] = [
    {
      parent: MOCK_SESSIONS[0],
      children: MOCK_SESSIONS.filter((s) => s.parentId !== null),
    },
  ];

  return { sessions, trees, events, loading: false };
}
