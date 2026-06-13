import { EventEmitter } from "node:events";
import type { AgentSessionEvent } from "@mbe/types";

/**
 * Listener invoked with each event published for a session.
 */
export type SessionEventListener = (event: AgentSessionEvent) => void;

/**
 * Publish/subscribe seam for session events.
 *
 * `addEvent` publishes here after persisting; SSE connections subscribe for
 * live delivery. Kept behind an interface so an out-of-process adapter (e.g.
 * Redis pub/sub) can satisfy the same contract for multi-instance deployments.
 */
export interface SessionEventEmitter {
  /** Publish a persisted event to all subscribers of its session. */
  publish(event: AgentSessionEvent): void;
  /**
   * Subscribe to live events for a session.
   * @returns an unsubscribe function.
   */
  subscribe(sessionId: string, listener: SessionEventListener): () => void;
}

/**
 * In-process implementation backed by Node's EventEmitter. Single-instance
 * only — every subscriber to a session shares one emit, so N watchers cost
 * zero extra database reads after connect.
 */
export class InProcessSessionEventEmitter implements SessionEventEmitter {
  private readonly emitter = new EventEmitter();

  constructor() {
    // SSE fan-out can exceed the default 10-listener warning threshold.
    this.emitter.setMaxListeners(0);
  }

  publish(event: AgentSessionEvent): void {
    this.emitter.emit(event.sessionId, event);
  }

  subscribe(sessionId: string, listener: SessionEventListener): () => void {
    this.emitter.on(sessionId, listener);
    return () => {
      this.emitter.off(sessionId, listener);
    };
  }
}

/**
 * Process-wide emitter seam. Defaults to the in-process implementation; can be
 * swapped (e.g. for a Redis adapter or a test double) via
 * {@link setSessionEventEmitter}.
 */
let sessionEventEmitter: SessionEventEmitter = new InProcessSessionEventEmitter();

export function getSessionEventEmitter(): SessionEventEmitter {
  return sessionEventEmitter;
}

export function setSessionEventEmitter(emitter: SessionEventEmitter): void {
  sessionEventEmitter = emitter;
}
