import { afterEach, describe, expect, it } from "vitest";
import * as Sentry from "@sentry/node";
import { exemptHeartbeatFromDedupe } from "./heartbeat-dedupe.js";

const DSN = "https://public@example.ingest.sentry.io/1";

function startClient(): string[] {
  const sent: string[] = [];
  Sentry.init({
    dsn: DSN,
    defaultIntegrations: false,
    integrations: exemptHeartbeatFromDedupe([Sentry.dedupeIntegration()]),
    transport: () => ({
      send: async (envelope) => {
        // Dropped events also produce a `client_report` envelope; count only events.
        const [, items] = envelope;
        for (const [header] of items) if (header.type === "event") sent.push(header.type);
        return {};
      },
      flush: async () => true,
    }),
  });
  return sent;
}

function capture429(requestId: string): void {
  Sentry.withScope((scope) => {
    scope.setTag("requestId", requestId);
    Sentry.captureMessage("HTTP 429: GET /health/sentry-heartbeat");
  });
}

// One call site, like the onResponse hook: Sentry's synthetic stack for a
// message includes the caller's line, so distinct lines would never dedupe.
function captureInSequence(...requestIds: readonly string[]): void {
  for (const id of requestIds) capture429(id);
}

describe("exemptHeartbeatFromDedupe (real SDK pipeline)", () => {
  afterEach(async () => {
    await Sentry.close();
  });

  it("sends two identical heartbeat events captured in sequence", async () => {
    const sent = startClient();
    captureInSequence("mbe-round-trip-1", "mbe-round-trip-2");
    await Sentry.flush(1000);
    expect(sent).toHaveLength(2);
  });

  it("still dedupes two identical ordinary events", async () => {
    const sent = startClient();
    captureInSequence("req-1", "req-2");
    await Sentry.flush(1000);
    expect(sent).toHaveLength(1);
  });

  it("does not let a heartbeat event reset dedupe of ordinary events", async () => {
    const sent = startClient();
    captureInSequence("req-1", "mbe-round-trip-1", "req-2");
    await Sentry.flush(1000);
    expect(sent).toHaveLength(2);
  });
});
