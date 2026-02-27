import { useState, useCallback, useMemo, useEffect } from "react";
import type { Session, SessionEvent, SessionTree } from "./types";
import { useSessions } from "./hooks/use-sessions";
import { useMultiSessionEvents } from "./hooks/use-multi-session-events";
import { useMockData } from "./hooks/use-mock-data";
import { useParticles } from "./hooks/use-particles";
import { Layout } from "./components/Layout";
import { StatsBar } from "./components/StatsBar";
import { SessionList } from "./components/SessionList";
import { ArchitectureGraph } from "./components/graph/ArchitectureGraph";
import { DetailPanel } from "./components/detail/DetailPanel";

const MOCK_MODE = import.meta.env.VITE_MOCK === "true";

export function App() {
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedChildSession, setSelectedChildSession] = useState<Session | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<SessionEvent | null>(null);

  // Data sources
  const liveData = useSessions(!MOCK_MODE);
  const mockData = useMockData();

  const sessions = MOCK_MODE ? mockData.sessions : liveData.sessions;
  const trees = MOCK_MODE ? mockData.trees : liveData.trees;

  // Find selected tree
  const selectedTree: SessionTree | undefined = useMemo(
    () => trees.find((t) => t.parent.id === selectedParentId),
    [trees, selectedParentId]
  );

  // Auto-select first tree if none selected
  const effectiveParentId = selectedParentId ?? trees[0]?.parent.id ?? null;
  const effectiveTree = selectedTree ?? trees[0];

  // Subscribe to ALL sessions in the tree: parent + all children
  const allSessionIds = useMemo(() => {
    if (!effectiveTree) return [];
    return [effectiveTree.parent.id, ...effectiveTree.children.map((c) => c.id)];
  }, [effectiveTree]);

  const liveEvents = useMultiSessionEvents(allSessionIds, !MOCK_MODE);

  // In mock mode, use mock events; in live mode, use merged SSE events
  const events = MOCK_MODE ? mockData.events : liveEvents.events;

  // Particle animation management (external store)
  const { particles, activeNodes, processEvents } = useParticles();

  useEffect(() => {
    processEvents(events);
  }, [events, processEvents]);

  // The session to show in detail panel
  const detailSession =
    selectedChildSession ??
    effectiveTree?.parent ??
    null;

  // Filter events for the detail panel (show selected session's events only)
  const detailEvents = useMemo(() => {
    if (!detailSession) return [];
    return events.filter((e) => e.sessionId === detailSession.id);
  }, [events, detailSession]);

  const handleSelectParent = useCallback((parentId: string) => {
    setSelectedParentId(parentId);
    setSelectedChildSession(null);
    setSelectedEvent(null);
  }, []);

  const handleSelectSession = useCallback((session: Session) => {
    setSelectedChildSession(session);
    setSelectedEvent(null);
  }, []);

  const handleSelectEvent = useCallback((event: SessionEvent) => {
    setSelectedEvent(event);
  }, []);

  return (
    <Layout
      header={<StatsBar sessions={[...sessions]} mockMode={MOCK_MODE} />}
      sidebar={
        <SessionList
          trees={trees}
          selectedId={effectiveParentId}
          onSelect={handleSelectParent}
        />
      }
      main={
        <ArchitectureGraph
          childSessions={effectiveTree?.children ?? []}
          particles={particles}
          activeNodes={activeNodes}
          onSelectEvent={handleSelectEvent}
          onSelectSession={handleSelectSession}
          selectedSessionId={selectedChildSession?.id ?? null}
        />
      }
      detail={
        <DetailPanel
          session={detailSession}
          events={detailEvents}
          selectedEvent={selectedEvent}
          onSelectEvent={handleSelectEvent}
        />
      }
      detailOpen={detailSession !== null}
    />
  );
}
