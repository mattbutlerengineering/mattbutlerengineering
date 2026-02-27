import { useCallback, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import type { Session, SessionEvent, MessageParticle as ParticleType, NodeId } from "../../types";
import { NODE_POSITIONS } from "../../lib/constants";
import { CONNECTIONS, getChildSessionPositions } from "./graph-layout";
import { SystemNode } from "./SystemNode";
import { ConnectionLine } from "./ConnectionLine";
import { MessageParticle } from "./MessageParticle";
import { SessionNode } from "./SessionNode";

interface ArchitectureGraphProps {
  readonly childSessions: readonly Session[];
  readonly particles: readonly ParticleType[];
  readonly activeNodes: ReadonlySet<NodeId>;
  readonly onSelectEvent: (event: SessionEvent) => void;
  readonly onSelectSession: (session: Session) => void;
  readonly selectedSessionId: string | null;
}

export function ArchitectureGraph({
  childSessions,
  particles,
  activeNodes,
  onSelectEvent,
  onSelectSession,
  selectedSessionId,
}: ArchitectureGraphProps) {
  const handleParticleClick = useCallback(
    (particle: ParticleType) => {
      onSelectEvent(particle.event);
    },
    [onSelectEvent]
  );

  const childPositions = useMemo(
    () => getChildSessionPositions(childSessions.length),
    [childSessions.length]
  );
  const hasActivity = particles.length > 0;

  return (
    <svg
      viewBox="0 0 800 600"
      className="h-full w-full"
      style={{ minHeight: 400 }}
    >
      <defs>
        <filter id="particle-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Connection lines */}
      {CONNECTIONS.map((conn) => (
        <ConnectionLine
          key={`${conn.from}-${conn.to}`}
          connection={conn}
          active={hasActivity && (activeNodes.has(conn.from) || activeNodes.has(conn.to))}
        />
      ))}

      {/* Child session nodes */}
      {childSessions.map((child, i) => {
        const pos = childPositions[i];
        if (!pos) return null;
        return (
          <SessionNode
            key={child.id}
            session={child}
            x={pos.x}
            y={pos.y}
            selected={selectedSessionId === child.id}
            onClick={onSelectSession}
          />
        );
      })}

      {/* System nodes */}
      {(Object.keys(NODE_POSITIONS) as NodeId[]).map((nodeId) => (
        <SystemNode
          key={nodeId}
          nodeId={nodeId}
          active={activeNodes.has(nodeId)}
        />
      ))}

      {/* Animated particles */}
      <AnimatePresence>
        {particles.map((particle) => (
          <MessageParticle
            key={particle.id}
            particle={particle}
            onClick={handleParticleClick}
          />
        ))}
      </AnimatePresence>
    </svg>
  );
}
