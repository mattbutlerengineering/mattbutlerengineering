import type { Session, SessionEvent } from "../types";

const BASE_URL = import.meta.env.VITE_AGENT_API_URL ?? "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── Sessions ────────────────────────────────────────────────────────

interface SessionListResponse {
  readonly data: readonly Session[];
  readonly total: number;
}

export async function fetchSessions(limit = 50): Promise<readonly Session[]> {
  const response = await fetchJson<SessionListResponse>(`/v1/sessions?limit=${limit}`);
  return response.data;
}

export async function fetchSession(id: string): Promise<Session> {
  const response = await fetchJson<{ data: Session }>(`/v1/sessions/${id}`);
  return response.data;
}

// ── SSE Events ──────────────────────────────────────────────────────

export function connectSessionEvents(
  sessionId: string,
  onEvent: (event: SessionEvent) => void,
  onEnd?: () => void
): () => void {
  const eventSource = new EventSource(`${BASE_URL}/v1/sessions/${sessionId}/events`);

  const handleEvent = (e: MessageEvent) => {
    try {
      const parsed = JSON.parse(e.data as string) as SessionEvent;
      onEvent(parsed);
    } catch {
      // Ignore unparseable events
    }
  };

  // Listen for all known event types
  const eventTypes = [
    "session:start",
    "session:tool_use",
    "session:tool_result",
    "session:assistant",
    "session:message",
    "session:complete",
    "session:error",
    "session:cancelled",
    "orchestrator:start",
    "orchestrator:session_created",
    "orchestrator:complete",
  ];

  for (const type of eventTypes) {
    eventSource.addEventListener(type, handleEvent);
  }

  eventSource.addEventListener("stream:end", () => {
    eventSource.close();
    onEnd?.();
  });

  eventSource.addEventListener("error", () => {
    // SSE will auto-reconnect
  });

  return () => {
    eventSource.close();
  };
}
