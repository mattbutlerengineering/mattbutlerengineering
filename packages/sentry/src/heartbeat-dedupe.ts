import type { NodeOptions } from "@sentry/node";

type IntegrationsFn = Extract<
  NonNullable<NodeOptions["integrations"]>,
  (...args: never[]) => unknown
>;
type Integration = Parameters<IntegrationsFn>[0][number];

/**
 * Prefix of the `requestId` the daily Sentry heartbeat sends
 * (scripts/sentry-round-trip.mjs MARKER_PREFIX). Keep in sync.
 */
const HEARTBEAT_REQUEST_ID_PREFIX = "mbe-round-trip";

function isHeartbeatEvent(event: { readonly tags?: Record<string, unknown> }): boolean {
  const requestId = event.tags?.requestId;
  return typeof requestId === "string" && requestId.startsWith(HEARTBEAT_REQUEST_ID_PREFIX);
}

/**
 * Sentry's Dedupe integration drops an event identical (message + stacktrace)
 * to the previous one the process captured. The heartbeat provokes the same
 * `HTTP 429` message every day, so on a day with no deploy in between it was
 * silently dropped and the round-trip lookup reported not-found. Heartbeat
 * events (requestId tag carries the marker) bypass Dedupe entirely: they are
 * neither dropped nor recorded as the "previous" event. Ordinary events are
 * still deduped and grouping is untouched.
 *
 * Integration processors run in list order, before `beforeSend`, and the scope
 * tags are already merged into the event by then.
 */
export function exemptHeartbeatFromDedupe(integrations: readonly Integration[]): Integration[] {
  return integrations.map((integration) => {
    if (integration.name !== "Dedupe" || !integration.processEvent) return integration;
    const { processEvent } = integration;
    return {
      ...integration,
      processEvent: (event, hint, client) =>
        isHeartbeatEvent(event) ? event : processEvent.call(integration, event, hint, client),
    };
  });
}
