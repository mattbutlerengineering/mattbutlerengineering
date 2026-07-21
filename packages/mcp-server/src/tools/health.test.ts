import { describe, it, expect, vi, afterEach } from "vitest";
import { serviceHealthCheck } from "./health.js";

describe("serviceHealthCheck", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns healthy status for all responsive services", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    );

    const result = await serviceHealthCheck();
    const parsed = JSON.parse(result) as Array<{
      service: string;
      status: string;
      statusCode: number;
      latencyMs: number;
    }>;

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    parsed.forEach((svc) => {
      expect(svc.status).toBe("healthy");
      expect(svc.statusCode).toBe(200);
      expect(typeof svc.latencyMs).toBe("number");
    });
  });

  it("returns unhealthy status for non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 } as unknown as Response)
    );

    const result = await serviceHealthCheck();
    const parsed = JSON.parse(result) as Array<{ status: string; statusCode: number }>;

    parsed.forEach((svc) => {
      expect(svc.status).toBe("unhealthy");
      expect(svc.statusCode).toBe(503);
    });
  });

  it("returns unreachable status when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await serviceHealthCheck();
    const parsed = JSON.parse(result) as Array<{
      status: string;
      statusCode: null;
      latencyMs: null;
    }>;

    parsed.forEach((svc) => {
      expect(svc.status).toBe("unreachable");
      expect(svc.statusCode).toBeNull();
      expect(svc.latencyMs).toBeNull();
    });
  });

  it("includes all three service names in results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    );

    const result = await serviceHealthCheck();
    const parsed = JSON.parse(result) as Array<{ service: string }>;
    const serviceNames = parsed.map((r) => r.service);

    expect(serviceNames).toContain("users");
    expect(serviceNames).toContain("reservations");
    expect(serviceNames).toContain("agent");
  });

  it("handles mixed healthy and unreachable services", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 } as unknown as Response)
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ ok: false, status: 503 } as unknown as Response);

    vi.stubGlobal("fetch", fetchMock);

    const result = await serviceHealthCheck();
    const parsed = JSON.parse(result) as Array<{ status: string }>;

    expect(parsed[0].status).toBe("healthy");
    expect(parsed[1].status).toBe("unreachable");
    expect(parsed[2].status).toBe("unhealthy");
  });

  it("result is a valid MCP text content string", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const result = await serviceHealthCheck();
    const mcpContent = [{ type: "text" as const, text: result }];

    expect(mcpContent[0].type).toBe("text");
    expect(typeof mcpContent[0].text).toBe("string");
    expect(() => JSON.parse(result)).not.toThrow();
  });
});
