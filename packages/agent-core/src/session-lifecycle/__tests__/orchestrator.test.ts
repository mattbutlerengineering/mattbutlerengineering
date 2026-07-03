import { describe, it, expect, vi } from "vitest";
import { createSessionLifecycleOrchestrator } from "../orchestrator.js";
import { createInMemorySessionStore } from "../in-memory-store.js";
import type { InMemorySessionStore } from "../in-memory-store.js";
import type { ConcurrencyGate, RunSessionFn } from "../types.js";
import type { SessionConfig, SessionEvent, SessionResult } from "../../types.js";

function buildResult(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    sessionId: "sdk-1",
    status: "succeeded",
    branchName: "agent/x",
    prUrl: "https://pr/1",
    costUsd: 0.5,
    tokenUsage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 1234,
    numTurns: 3,
    resultText: "done",
    errors: [],
    ...overrides,
  };
}

function setup(opts: { runSession: RunSessionFn; concurrency?: ConcurrencyGate }): {
  store: InMemorySessionStore;
  orchestrator: ReturnType<typeof createSessionLifecycleOrchestrator>;
} {
  const store = createInMemorySessionStore();
  const orchestrator = createSessionLifecycleOrchestrator({
    store,
    resolveRepoPath: () => "/repo",
    runSession: opts.runSession,
    concurrency: opts.concurrency,
  });
  return { store, orchestrator };
}

describe("SessionLifecycleOrchestrator", () => {
  it("create persists a pending session", async () => {
    const { store, orchestrator } = setup({ runSession: vi.fn() });

    const session = await orchestrator.create({ taskDescription: "task" });

    expect(session.status).toBe("pending");
    expect(await store.getById(session.id)).toMatchObject({ status: "pending" });
  });

  it("execute runs runSession with a config built from the stored session", async () => {
    let received: SessionConfig | undefined;
    const runSession: RunSessionFn = vi.fn(async (config) => {
      received = config;
      return buildResult();
    });
    const { orchestrator } = setup({ runSession });

    const session = await orchestrator.create({
      taskDescription: "do it",
      model: "claude-opus-4-8",
      baseBranch: "develop",
      maxTurns: 7,
      maxBudgetUsd: 3,
    });
    await orchestrator.execute(session.id);

    expect(received).toMatchObject({
      taskDescription: "do it",
      repoPath: "/repo",
      model: "claude-opus-4-8",
      baseBranch: "develop",
      maxTurns: 7,
      maxBudgetUsd: 3,
    });
  });

  it("execute transitions pending -> running -> succeeded and persists results", async () => {
    const { store, orchestrator } = setup({
      runSession: async () => buildResult({ costUsd: 0.9, prUrl: "https://pr/9" }),
    });

    const session = await orchestrator.create({ taskDescription: "task" });
    const result = await orchestrator.execute(session.id);

    expect(result?.status).toBe("succeeded");
    const persisted = await store.getById(session.id);
    expect(persisted?.status).toBe("succeeded");
    expect(persisted?.costUsd).toBe(0.9);
    expect(persisted?.prUrl).toBe("https://pr/9");
    expect(store.listEvents(session.id).map((e) => e.type)).toEqual([
      "session:start",
      "session:complete",
    ]);
  });

  it("execute maps a failed runSession result to failed status", async () => {
    const { store, orchestrator } = setup({
      runSession: async () => buildResult({ status: "failed", errors: ["boom"] }),
    });

    const session = await orchestrator.create({ taskDescription: "task" });
    const result = await orchestrator.execute(session.id);

    expect(result?.status).toBe("failed");
    const persisted = await store.getById(session.id);
    expect(persisted?.status).toBe("failed");
    expect(persisted?.errors).toEqual(["boom"]);
  });

  it("execute marks the session failed and emits session:error when runSession throws", async () => {
    const { store, orchestrator } = setup({
      runSession: async () => {
        throw new Error("kaboom");
      },
    });

    const session = await orchestrator.create({ taskDescription: "task" });
    await orchestrator.execute(session.id);

    const persisted = await store.getById(session.id);
    expect(persisted?.status).toBe("failed");
    expect(persisted?.errors).toEqual(["kaboom"]);
    expect(store.listEvents(session.id).map((e) => e.type)).toEqual([
      "session:start",
      "session:error",
    ]);
  });

  it("execute forwards runtime events to the store via the projector", async () => {
    const events: SessionEvent[] = [
      { type: "session:assistant", timestamp: "t", data: { message: "thinking" } },
      { type: "session:tool_use", timestamp: "t", data: { message: "edit" } },
    ];
    const runSession: RunSessionFn = async (_config, onEvent) => {
      for (const e of events) onEvent?.(e);
      return buildResult();
    };
    const { store, orchestrator } = setup({ runSession });

    const session = await orchestrator.create({ taskDescription: "task" });
    await orchestrator.execute(session.id);

    const types = store.listEvents(session.id).map((e) => e.type);
    expect(types).toContain("session:assistant");
    expect(types).toContain("session:tool_use");
  });

  it("execute returns null for an unknown session", async () => {
    const { orchestrator } = setup({ runSession: vi.fn() });
    expect(await orchestrator.execute("missing")).toBeNull();
  });

  it("marks the session failed (not left pending) when store.getById throws (#2886)", async () => {
    const store = createInMemorySessionStore();
    const orchestrator = createSessionLifecycleOrchestrator({
      store,
      resolveRepoPath: () => "/repo",
      runSession: vi.fn(),
    });

    const session = await orchestrator.create({ taskDescription: "task" });
    const originalGetById = store.getById.bind(store);
    store.getById = async () => {
      throw new Error("transient db error");
    };

    const result = await orchestrator.execute(session.id);

    expect(result).toBeNull();
    const persisted = await originalGetById(session.id);
    expect(persisted?.status).toBe("failed");
    expect(persisted?.errors).toEqual(["transient db error"]);
  });

  it("persists result data on cancel-after-complete while keeping status cancelled (#2887A)", async () => {
    let entered = false;
    let resolveRun: ((result: SessionResult) => void) | undefined;
    const runSession: RunSessionFn = () =>
      new Promise<SessionResult>((resolve) => {
        entered = true;
        resolveRun = resolve;
      });

    const store = createInMemorySessionStore();
    const orchestrator = createSessionLifecycleOrchestrator({
      store,
      resolveRepoPath: () => "/repo",
      runSession,
    });

    const session = await orchestrator.create({ taskDescription: "task" });
    const exec = orchestrator.execute(session.id);
    while (!entered) {
      await Promise.resolve();
    }

    const cancelled = await orchestrator.cancel(session.id);
    expect(cancelled).toBe(true);

    // The pipeline is not force-killed — it runs to its natural end and can
    // still produce a real branch/PR/cost.
    resolveRun?.(buildResult({ branchName: "agent/x", prUrl: "https://pr/1", costUsd: 0.42 }));
    await exec;

    const persisted = await store.getById(session.id);
    expect(persisted?.status).toBe("cancelled");
    expect(persisted?.branchName).toBe("agent/x");
    expect(persisted?.prUrl).toBe("https://pr/1");
    expect(persisted?.costUsd).toBe(0.42);
  });

  it("does not masquerade a post-success terminal-write failure as a dropped-result pipeline failure (#2887B)", async () => {
    const store = createInMemorySessionStore();
    const orchestrator = createSessionLifecycleOrchestrator({
      store,
      resolveRepoPath: () => "/repo",
      runSession: async () => buildResult({ costUsd: 1.23, prUrl: "https://pr/7" }),
    });

    const session = await orchestrator.create({ taskDescription: "task" });
    const originalUpdateStatus = store.updateStatus.bind(store);
    store.updateStatus = async (id, status, patch, opts) => {
      if (status === "succeeded") throw new Error("terminal write boom");
      return originalUpdateStatus(id, status, patch, opts);
    };

    const result = await orchestrator.execute(session.id);

    // The real result is still returned to the caller — not dropped.
    expect(result?.status).toBe("succeeded");
    expect(result?.costUsd).toBe(1.23);
    expect(result?.prUrl).toBe("https://pr/7");

    // The row must not have been clobbered to `failed` with the result
    // discarded — the terminal write never applied, so it's still `running`.
    const persisted = await store.getById(session.id);
    expect(persisted?.status).toBe("running");
    expect(persisted?.errors).toEqual([]);
  });

  it("logs a swallowed addEvent failure with {sessionId, type, err} instead of failing the session (#2888A)", async () => {
    const store = createInMemorySessionStore();
    store.addEvent = async () => {
      throw new Error("event write boom");
    };
    const logger = { error: vi.fn() };

    const orchestrator = createSessionLifecycleOrchestrator({
      store,
      resolveRepoPath: () => "/repo",
      runSession: async () => buildResult(),
      logger,
    });

    const session = await orchestrator.create({ taskDescription: "task" });
    const result = await orchestrator.execute(session.id);

    expect(result?.status).toBe("succeeded");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        type: "session:start",
        err: expect.any(Error),
      }),
      expect.any(String)
    );
  });

  it("cancel aborts a running session and transitions to cancelled", async () => {
    let entered = false;
    let resolveRun: (() => void) | undefined;
    const runSession: RunSessionFn = (_config) =>
      new Promise<SessionResult>((resolve) => {
        entered = true;
        resolveRun = () => resolve(buildResult());
      });

    const store = createInMemorySessionStore();
    const orchestrator = createSessionLifecycleOrchestrator({
      store,
      resolveRepoPath: () => "/repo",
      runSession,
    });

    const session = await orchestrator.create({ taskDescription: "task" });
    const exec = orchestrator.execute(session.id);
    // Yield until the pipeline is running (controller registered) — microtask
    // loop, immune to timer starvation under parallel load.
    while (!entered) {
      await Promise.resolve();
    }

    const cancelled = await orchestrator.cancel(session.id);
    resolveRun?.();
    await exec;

    expect(cancelled).toBe(true);
    const persisted = await store.getById(session.id);
    expect(persisted?.status).toBe("cancelled");
    expect(store.listEvents(session.id).map((e) => e.type)).toContain("session:cancelled");
  });

  it("passes the AbortController's signal into runSession so cancel() short-circuits the pipeline (#2853)", async () => {
    let receivedSignal: AbortSignal | undefined;
    let laterPhaseRan = false;
    let entered = false;
    let resolveEarlyPhase: (() => void) | undefined;

    // Fake/stub pipeline: simulates a phase boundary — it awaits until the
    // test signals the "first phase" is done, then checks the signal before
    // running its "later phase", exactly like `runPipeline`'s real boundary
    // checks in session-runner.ts.
    const runSession: RunSessionFn = async (_config, _onEvent, _deps, signal) => {
      receivedSignal = signal;
      entered = true;
      await new Promise<void>((resolve) => {
        resolveEarlyPhase = resolve;
      });
      if (signal?.aborted) {
        return buildResult({ status: "failed", errors: ["Session aborted"] });
      }
      laterPhaseRan = true;
      return buildResult();
    };

    const store = createInMemorySessionStore();
    const orchestrator = createSessionLifecycleOrchestrator({
      store,
      resolveRepoPath: () => "/repo",
      runSession,
    });

    const session = await orchestrator.create({ taskDescription: "task" });
    const exec = orchestrator.execute(session.id);
    while (!entered) {
      await Promise.resolve();
    }

    const cancelled = await orchestrator.cancel(session.id);
    expect(cancelled).toBe(true);
    expect(receivedSignal?.aborted).toBe(true);

    resolveEarlyPhase?.();
    await exec;

    expect(laterPhaseRan).toBe(false);
    const persisted = await store.getById(session.id);
    expect(persisted?.status).toBe("cancelled");
  });

  it("cancel returns false when no live execution exists", async () => {
    const { orchestrator } = setup({ runSession: vi.fn() });
    const session = await orchestrator.create({ taskDescription: "task" });
    expect(await orchestrator.cancel(session.id)).toBe(false);
  });

  it("cancel() landing after execute() persists a terminal status does not clobber it (reverse-race)", async () => {
    const store = createInMemorySessionStore();
    const runSession: RunSessionFn = async () => buildResult({ status: "succeeded" });
    const orchestrator = createSessionLifecycleOrchestrator({
      store,
      resolveRepoPath: () => "/repo",
      runSession,
    });

    const session = await orchestrator.create({ taskDescription: "task" });

    // Simulate the race window: intercept the terminal `updateStatus` write so
    // that cancel() runs AFTER the terminal status is persisted but BEFORE
    // execute()'s `finally` removes the controller from activeControllers —
    // exactly the window described in the bug.
    const originalUpdateStatus = store.updateStatus.bind(store);
    let cancelResult: boolean | undefined;
    store.updateStatus = async (id, status, patch, opts) => {
      const result = await originalUpdateStatus(id, status, patch, opts);
      if (status === "succeeded") {
        cancelResult = await orchestrator.cancel(id);
      }
      return result;
    };

    await orchestrator.execute(session.id);

    expect(cancelResult).toBe(false);
    const persisted = await store.getById(session.id);
    expect(persisted?.status).toBe("succeeded");
    expect(store.listEvents(session.id).map((e) => e.type)).not.toContain("session:cancelled");
  });

  describe("with a concurrency gate", () => {
    function gate(limit: number): ConcurrencyGate {
      const active = new Set<string>();
      return {
        limit,
        acquire(id) {
          if (active.has(id)) return true;
          if (active.size >= limit) return false;
          active.add(id);
          return true;
        },
        release(id) {
          active.delete(id);
        },
        activeCount() {
          return active.size;
        },
      };
    }

    it("rejects execution and marks failed when the gate is at capacity", async () => {
      const full = gate(0);
      const { store, orchestrator } = setup({
        runSession: vi.fn(async () => buildResult()),
        concurrency: full,
      });

      const session = await orchestrator.create({ taskDescription: "task" });
      const result = await orchestrator.execute(session.id);

      expect(result).toBeNull();
      const persisted = await store.getById(session.id);
      expect(persisted?.status).toBe("failed");
    });

    it("releases the slot after a successful execution", async () => {
      const g = gate(1);
      const { orchestrator } = setup({
        runSession: async () => buildResult(),
        concurrency: g,
      });

      const session = await orchestrator.create({ taskDescription: "task" });
      await orchestrator.execute(session.id);

      expect(g.activeCount()).toBe(0);
      expect(orchestrator.getActiveSessionCount()).toBe(0);
    });
  });
});
