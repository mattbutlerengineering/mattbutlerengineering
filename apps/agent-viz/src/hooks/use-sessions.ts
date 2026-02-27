import { useState, useEffect, useCallback } from "react";
import type { Session, SessionTree } from "../types";
import { fetchSessions } from "../lib/api";
import { SESSION_POLL_INTERVAL_MS } from "../lib/constants";

interface UseSessionsResult {
  readonly sessions: readonly Session[];
  readonly trees: readonly SessionTree[];
  readonly loading: boolean;
  readonly error: string | null;
}

function buildTrees(sessions: readonly Session[]): readonly SessionTree[] {
  const parentSessions = sessions.filter((s) => s.parentId === null);
  const childMap = new Map<string, Session[]>();

  for (const session of sessions) {
    if (session.parentId) {
      const existing = childMap.get(session.parentId) ?? [];
      childMap.set(session.parentId, [...existing, session]);
    }
  }

  return parentSessions.map((parent) => ({
    parent,
    children: childMap.get(parent.id) ?? [],
  }));
}

export function useSessions(enabled: boolean): UseSessionsResult {
  const [sessions, setSessions] = useState<readonly Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const data = await fetchSessions();
      setSessions(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    poll();
    const interval = setInterval(poll, SESSION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, poll]);

  const trees = buildTrees(sessions);

  return { sessions, trees, loading, error };
}
