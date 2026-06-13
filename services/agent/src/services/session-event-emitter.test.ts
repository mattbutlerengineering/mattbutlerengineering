import { describe, it, expect, vi } from "vitest";
import type { AgentSessionEvent } from "@mbe/types";
import {
  InProcessSessionEventEmitter,
  getSessionEventEmitter,
  setSessionEventEmitter,
  type SessionEventEmitter,
} from "./session-event-emitter.js";

function makeEvent(sessionId: string, id: string): AgentSessionEvent {
  return { id, sessionId, type: "test", data: {}, createdAt: new Date().toISOString() };
}

describe("InProcessSessionEventEmitter", () => {
  it("delivers published events to a subscriber of the same session", () => {
    const emitter = new InProcessSessionEventEmitter();
    const listener = vi.fn();
    emitter.subscribe("s1", listener);

    const event = makeEvent("s1", "e1");
    emitter.publish(event);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it("isolates events by session id", () => {
    const emitter = new InProcessSessionEventEmitter();
    const listener = vi.fn();
    emitter.subscribe("s1", listener);

    emitter.publish(makeEvent("s2", "e1"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("fans out a single publish to multiple concurrent subscribers", () => {
    const emitter = new InProcessSessionEventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.subscribe("s1", a);
    emitter.subscribe("s1", b);

    const event = makeEvent("s1", "e1");
    emitter.publish(event);

    expect(a).toHaveBeenCalledWith(event);
    expect(b).toHaveBeenCalledWith(event);
  });

  it("stops delivering after unsubscribe", () => {
    const emitter = new InProcessSessionEventEmitter();
    const listener = vi.fn();
    const unsubscribe = emitter.subscribe("s1", listener);

    unsubscribe();
    emitter.publish(makeEvent("s1", "e1"));

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("session event emitter seam", () => {
  it("defaults to an in-process emitter", () => {
    expect(getSessionEventEmitter()).toBeInstanceOf(InProcessSessionEventEmitter);
  });

  it("can be swapped for an alternate implementation", () => {
    const original = getSessionEventEmitter();
    const custom: SessionEventEmitter = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    try {
      setSessionEventEmitter(custom);
      expect(getSessionEventEmitter()).toBe(custom);
    } finally {
      setSessionEventEmitter(original);
    }
  });
});
