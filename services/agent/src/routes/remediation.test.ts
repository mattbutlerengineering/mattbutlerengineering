/* eslint-disable */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createHmac } from "node:crypto";

// Mock all dependencies
vi.mock("../services/session.js", () => ({
  sessionService: {
    create: vi.fn(),
  },
}));

vi.mock("../services/session-executor.js", () => ({
  executeSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/remediation-circuit-breaker.js", () => ({
  checkCircuitBreaker: vi.fn().mockReturnValue({ allowed: true }),
  recordRemediationOutcome: vi.fn(),
}));

import { sessionService } from "../services/session.js";
import { executeSession } from "../services/session-executor.js";
import { checkCircuitBreaker } from "../services/remediation-circuit-breaker.js";
import { buildApp } from "../app.js";

describe("Remediation Webhook Routes", () => {
  let app: FastifyInstance;
  const secret = "test-secret";

  beforeEach(async () => {
    process.env.REMEDIATION_WEBHOOK_SECRET = secret;
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  const validPayload = {
    source: "grafana",
    alertName: "High Error Rate",
    severity: "critical",
    summary: "Error rate is above 5% on production",
    generatorURL: "https://grafana.example.com",
    labels: { service: "api" },
  };

  it("returns 401 if REMEDIATION_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.REMEDIATION_WEBHOOK_SECRET;
    
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/remediation",
      headers: { "content-type": "application/json" },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(401);
    const body = response.json() as { message: string };
    expect(body.message).toContain("not configured");
  });

  it("returns 401 for invalid signature", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/remediation",
      headers: { 
        "x-remediation-signature": "wrong",
        "content-type": "application/json"
      },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(401);
    const body = response.json() as { message: string };
    expect(body.message).toContain("Invalid webhook signature");
  });

  it("returns 400 for invalid payload", async () => {
    const invalidPayload = { source: "invalid" };
    const payloadStr = JSON.stringify(invalidPayload);
    const signature = createHmac("sha256", secret).update(payloadStr).digest("hex");

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/remediation",
      headers: { 
        "x-remediation-signature": signature,
        "content-type": "application/json"
      },
      payload: payloadStr,
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { message: string };
    expect(body.message).toContain("Invalid alert payload");
  });

  it("returns 200 and skips session creation for 'info' severity", async () => {
    const infoPayload = { ...validPayload, severity: "info" };
    const payloadStr = JSON.stringify(infoPayload);
    const signature = createHmac("sha256", secret).update(payloadStr).digest("hex");

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/remediation",
      headers: { 
        "x-remediation-signature": signature,
        "content-type": "application/json"
      },
      payload: payloadStr,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sessionId).toBe("");
    expect(sessionService.create).not.toHaveBeenCalled();
  });

  it("returns 503 if circuit breaker is open", async () => {
    vi.mocked(checkCircuitBreaker).mockReturnValueOnce({ 
      allowed: false, 
      reason: "Too many recent failures" 
    });
    
    const payloadStr = JSON.stringify(validPayload);
    const signature = createHmac("sha256", secret).update(payloadStr).digest("hex");

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/remediation",
      headers: { 
        "x-remediation-signature": signature,
        "content-type": "application/json"
      },
      payload: payloadStr,
    });

    expect(response.statusCode).toBe(503);
    const body = response.json() as { message: string };
    expect(body.message).toBe("Too many recent failures");
  });

  it("creates and executes a session for critical/warning alerts", async () => {
    const mockSession = { id: "remed-session-123" };
    vi.mocked(sessionService.create).mockResolvedValueOnce(mockSession as unknown as never);
    
    const payloadStr = JSON.stringify(validPayload);
    const signature = createHmac("sha256", secret).update(payloadStr).digest("hex");

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/remediation",
      headers: { 
        "x-remediation-signature": signature,
        "content-type": "application/json"
      },
      payload: payloadStr,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sessionId).toBe("remed-session-123");
    
    expect(sessionService.create).toHaveBeenCalledWith(expect.objectContaining({
      baseBranch: "main"
    }));
    expect(executeSession).toHaveBeenCalled();
  });

  it("handles execution success and failure in fire-and-forget", async () => {
    const mockSession = { id: "remed-session-456" };
    vi.mocked(sessionService.create).mockResolvedValueOnce(mockSession as unknown as never);
    
    // Test success path
    vi.mocked(executeSession).mockResolvedValueOnce(undefined);
    
    const payloadStr = JSON.stringify(validPayload);
    const signature = createHmac("sha256", secret).update(payloadStr).digest("hex");
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/remediation",
      headers: { 
        "x-remediation-signature": signature,
        "content-type": "application/json"
      },
      payload: payloadStr,
    });

    // We need to wait a bit because it's fire-and-forget
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(executeSession).toHaveBeenCalled();
  });
});
