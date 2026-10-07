/**
 * Executor: carries out a planned effect list against the ports
 * (architecture.md "`transitions/run.ts`: executor").
 *
 * - Background effects are launched first, as ONE detached chain, in order.
 *   A `log` failure is logged and the chain continues; a `propagate` failure
 *   is logged once and stops the chain (the caller has already returned).
 * - Awaited effects then run in sequence before this resolves. A `log`
 *   failure is logged and the next effect runs; a `propagate` failure rejects.
 * - `replace-if-present` schedules the replacement only when `cancel`
 *   reported that it removed an existing job.
 */
import type { Effect, EffectPorts, JobOp, PlannedEffect } from "./ports.js";

export interface EffectLogger {
  error(details: object, msg: string): void;
}

function describe(effect: Effect): Record<string, unknown> {
  switch (effect.port) {
    case "events":
      return { port: "events", type: effect.event.type };
    case "messaging":
      return {
        port: "messaging",
        kind: effect.message.kind,
        reservationId: effect.message.reservation.id,
      };
    case "jobs":
      return { port: "jobs", op: effect.op.op, jobId: effect.op.jobId };
  }
}

async function runJob(op: JobOp, ports: EffectPorts): Promise<void> {
  switch (op.op) {
    case "schedule":
      await ports.jobs.schedule(op.jobType, op.payload, op.delayMs, op.jobId);
      return;
    case "cancel":
      await ports.jobs.cancel(op.jobId);
      return;
    case "replace-if-present":
      if (await ports.jobs.cancel(op.jobId)) {
        await ports.jobs.schedule(op.jobType, op.payload, op.delayMs, op.jobId);
      }
      return;
  }
}

async function applyEffect(effect: Effect, ports: EffectPorts): Promise<void> {
  switch (effect.port) {
    case "events":
      ports.events.publish(effect.event);
      return;
    case "messaging":
      await ports.messaging.send(effect.message);
      return;
    case "jobs":
      await runJob(effect.op, ports);
      return;
  }
}

async function runBackgroundChain(
  chain: PlannedEffect[],
  ports: EffectPorts,
  logger: EffectLogger
): Promise<void> {
  for (const planned of chain) {
    try {
      await applyEffect(planned.effect, ports);
    } catch (err) {
      logger.error({ err, ...describe(planned.effect) }, "Background transition effect failed");
      if (planned.onFailure === "propagate") return;
    }
  }
}

export async function runEffects(
  planned: PlannedEffect[],
  ports: EffectPorts,
  logger: EffectLogger
): Promise<void> {
  const chain = planned.filter((p) => p.timing === "background");
  if (chain.length > 0) {
    // Detached by design: background effects settle after the response.
    // runBackgroundChain never rejects — every failure is caught and logged.
    void runBackgroundChain(chain, ports, logger);
  }

  for (const step of planned) {
    if (step.timing !== "await") continue;
    try {
      await applyEffect(step.effect, ports);
    } catch (err) {
      if (step.onFailure === "propagate") throw err;
      logger.error({ err, ...describe(step.effect) }, "Transition effect failed");
    }
  }
}
