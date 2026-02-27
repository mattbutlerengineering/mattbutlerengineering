import { useCallback, useRef, useSyncExternalStore } from "react";
import type { SessionEvent, MessageParticle, NodeId } from "../types";
import { EVENT_COLORS, PARTICLE_LIFETIME_MS, getToolTargetNode } from "../lib/constants";

function mapEventToRoute(event: SessionEvent): { from: NodeId; to: NodeId } | null {
  const { type } = event;
  const data = event.data as Record<string, unknown>;

  switch (type) {
    case "orchestrator:start":
    case "orchestrator:session_created":
      return { from: "orchestrator", to: "session-api" };
    case "orchestrator:complete":
      return { from: "session-api", to: "orchestrator" };
    case "session:start":
      return { from: "session-api", to: "agent-core" };
    case "session:tool_use": {
      const target = getToolTargetNode(data.toolName as string | undefined);
      return { from: "agent-core", to: target };
    }
    case "session:tool_result":
      return { from: "claude-sdk", to: "agent-core" };
    case "session:assistant":
      return { from: "claude-sdk", to: "agent-core" };
    case "session:message":
      return { from: "agent-core", to: "claude-sdk" };
    case "session:complete":
      return data.prUrl
        ? { from: "agent-core", to: "github" }
        : { from: "agent-core", to: "session-api" };
    case "session:error":
      return { from: "agent-core", to: "session-api" };
    default:
      return null;
  }
}

interface ParticleStore {
  particles: readonly MessageParticle[];
  activeNodes: ReadonlySet<NodeId>;
}

/**
 * Manages particle animations as an external store.
 * Processes events into animated particles with automatic cleanup.
 */
export function useParticles() {
  const storeRef = useRef<ParticleStore>({ particles: [], activeNodes: new Set() });
  const listenersRef = useRef(new Set<() => void>());
  const processedRef = useRef(new Set<string>());
  const particleIdRef = useRef(0);

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  const getSnapshot = useCallback(() => storeRef.current, []);

  const notify = useCallback(() => {
    for (const listener of listenersRef.current) {
      listener();
    }
  }, []);

  const processEvents = useCallback(
    (events: readonly SessionEvent[]) => {
      const newParticles: MessageParticle[] = [];
      const newActive = new Set<NodeId>();

      for (const event of events) {
        if (processedRef.current.has(event.id)) continue;
        processedRef.current.add(event.id);

        const route = mapEventToRoute(event);
        if (!route) continue;

        particleIdRef.current += 1;
        newParticles.push({
          id: `p-${particleIdRef.current}`,
          from: route.from,
          to: route.to,
          color: EVENT_COLORS[event.type] ?? EVENT_COLORS.default,
          event,
        });
        newActive.add(route.from);
        newActive.add(route.to);
      }

      if (newParticles.length === 0) return;

      // Add new particles
      const currentActive = storeRef.current.activeNodes;
      storeRef.current = {
        particles: [...storeRef.current.particles, ...newParticles],
        activeNodes: new Set([...currentActive, ...newActive]),
      };
      notify();

      // Schedule cleanup
      setTimeout(() => {
        const ids = new Set(newParticles.map((p) => p.id));
        const remaining = storeRef.current.particles.filter((p) => !ids.has(p.id));
        const remainingActive = new Set<NodeId>();
        for (const p of remaining) {
          remainingActive.add(p.from);
          remainingActive.add(p.to);
        }
        storeRef.current = { particles: remaining, activeNodes: remainingActive };
        notify();
      }, PARTICLE_LIFETIME_MS);
    },
    [notify]
  );

  const store = useSyncExternalStore(subscribe, getSnapshot);

  return { ...store, processEvents };
}
