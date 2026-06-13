import { createHmac } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("../services/session.js", () => ({
  sessionService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: "test-session" }),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    addEvent: vi.fn(),
    listEvents: vi.fn(),
  },
}));

vi.mock("../services/session-executor.js", () => ({
  executeSession: vi.fn().mockResolvedValue(undefined),
  cancelSession: vi.fn(),
}));

vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
  getSlowQueryStats: vi.fn().mockReturnValue({ count5min: 0, slowestMs: 0 }),
  getServiceStatus: vi.fn().mockReturnValue("ok"),
  getPoolMetrics: vi.fn().mockReturnValue({
    active: 1,
    idle: 4,
    busy: 1,
    size: 5,
    utilization: 0.2,
    isDegraded: false,
  }),
}));

vi.mock("../services/remediation-circuit-breaker.js", () => ({
  checkCircuitBreaker: vi.fn().mockReturnValue({ allowed: true }),
  recordRemediationOutcome: vi.fn(),
}));

vi.stubGlobal("fetch", vi.fn());

import { buildApp } from "../app.js";

describe("verifiedWebhook plugin", () => {
  let app: FastifyInstance;

  const secret = "test-secret";

  beforeEach(async () => {
    process.env.GITHUB_WEBHOOK_SECRET = secret;
    process.env.GITHUB_TOKEN = "test-github-token";
    process.env.REMEDIATION_WEBHOOK_SECRET = secret;
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.GITHUB_TOKEN;
    delete process.env.REMEDIATION_WEBHOOK_SECRET;
    await app.close();
  });

  describe("format: 'sha256='", () => {
    it("accepts a valid signature", async () => {
      const payload = { test: true };
      const payloadStr = JSON.stringify(payload);
      const signature =
        `sha256=${createHmac("sha256", secret).update(payloadStr).digest("hex")}`;

      const response = await app.inject({
        method: "POST",
        url: "/v1/webhooks/github",
        payload,
        headers: {
          "x-github-event": "push",
          "x-hub-signature-256": signature,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("rejects an invalid signature (wrong HMAC)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/webhooks/github",
        payload: { test: true },
        headers: {
          "x-github-event": "push",
          "x-hub-signature-256":
            "sha256=0000000000000000000000000000000000000000000000000000000000000000",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("rejects a length-mismatched signature (pre-timingSafeEqual guard)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/webhooks/github",
        payload: { test: true },
        headers: {
          "x-github-event": "push",
          "x-hub-signature-256": "too-short",
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("format: 'raw'", () => {
    it("accepts a valid signature", async () => {
      const payload = {
        source: "grafana",
        alertName: "test",
        severity: "critical",
        summary: "test",
      };
      const payloadStr = JSON.stringify(payload);
      const signature = createHmac("sha256", secret).update(payloadStr).digest("hex");

      const response = await app.inject({
        method: "POST",
        url: "/v1/webhooks/remediation",
        payload: payloadStr,
        headers: {
          "x-remediation-signature": signature,
          "content-type": "application/json",
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("rejects an invalid signature", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/webhooks/remediation",
        payload: { source: "grafana", alertName: "test", severity: "critical", summary: "test" },
        headers: {
          "x-remediation-signature":
            "0000000000000000000000000000000000000000000000000000000000000000",
          "content-type": "application/json",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("rejects a length-mismatched signature", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/webhooks/remediation",
        payload: { source: "grafana", alertName: "test", severity: "critical", summary: "test" },
        headers: {
          "x-remediation-signature": "too-short",
          "content-type": "application/json",
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
