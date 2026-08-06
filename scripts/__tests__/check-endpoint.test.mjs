import { describe, it, expect, vi } from "vitest";
import { classifyStatus, probeEndpoint, checkEndpoint } from "../check-endpoint.mjs";

describe("classifyStatus", () => {
  it("classifies httpCode 0 as unreachable", () => {
    expect(classifyStatus({ httpCode: 0, bodyText: "" })).toBe("unreachable");
  });

  it("does not double-count a stringly-doubled code -- httpCode is always numeric", () => {
    // Regression guard for #3854 root cause 1: the old bash used
    // `HTTP_CODE=$(curl ... || echo "000")`, which could produce the string
    // "000000" on a connection failure. classifyStatus only ever receives a
    // real number from probeEndpoint, so 0 is the sole "unreachable" value.
    expect(classifyStatus({ httpCode: 0, bodyText: "" })).toBe("unreachable");
    expect(classifyStatus({ httpCode: 200, bodyText: "ok" })).not.toBe("unreachable");
  });

  it("classifies 5xx as error", () => {
    expect(classifyStatus({ httpCode: 500, bodyText: "" })).toBe("error");
    expect(classifyStatus({ httpCode: 503, bodyText: "" })).toBe("error");
  });

  it("classifies 4xx as client-error", () => {
    expect(classifyStatus({ httpCode: 404, bodyText: "" })).toBe("client-error");
    expect(classifyStatus({ httpCode: 400, bodyText: "" })).toBe("client-error");
  });

  it("classifies a body with status:degraded as degraded", () => {
    expect(classifyStatus({ httpCode: 200, bodyText: '{"status":"degraded"}' })).toBe("degraded");
  });

  it("does not misclassify non-JSON 200 bodies as degraded", () => {
    expect(classifyStatus({ httpCode: 200, bodyText: "<html>hi</html>" })).toBe("healthy");
  });

  it("classifies healthy when no pattern is given and body is plain 200", () => {
    expect(classifyStatus({ httpCode: 200, bodyText: "<html>...</html>" })).toBe("healthy");
  });

  it("classifies pattern-mismatch when expectPattern is not found in body", () => {
    expect(
      classifyStatus({ httpCode: 200, bodyText: "<html>...</html>", expectPattern: "missing-text" })
    ).toBe("pattern-mismatch");
  });

  it("classifies healthy when expectPattern is found in body", () => {
    expect(
      classifyStatus({ httpCode: 200, bodyText: "<html>...</html>", expectPattern: "<html" })
    ).toBe("healthy");
  });

  it("prioritizes unreachable over pattern matching", () => {
    expect(classifyStatus({ httpCode: 0, bodyText: "", expectPattern: "<html" })).toBe(
      "unreachable"
    );
  });
});

describe("probeEndpoint", () => {
  it("returns httpCode 0 when fetch throws (DNS failure / connection refused)", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));
    const result = await probeEndpoint("https://does-not-resolve.example", { fetchFn });
    expect(result.httpCode).toBe(0);
    expect(result.bodyText).toBe("");
  });

  it("returns the real status and body text on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("<html>hi</html>"),
    });
    const result = await probeEndpoint("https://example.com", { fetchFn });
    expect(result.httpCode).toBe(200);
    expect(result.bodyText).toBe("<html>hi</html>");
  });

  it("never lets a failed probe inherit a previous probe's body", async () => {
    // Regression guard for #3854 root cause 2 (stale shared response file).
    // Each probeEndpoint call reads its own response object -- there is no
    // shared file that a failure could leave un-truncated.
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve("<html>first</html>") })
      .mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const first = await probeEndpoint("https://first.example", { fetchFn });
    const second = await probeEndpoint("https://second.example", { fetchFn });

    expect(first.bodyText).toBe("<html>first</html>");
    expect(second.httpCode).toBe(0);
    expect(second.bodyText).toBe("");
  });
});

describe("checkEndpoint", () => {
  it("returns unreachable status for an endpoint that cannot be resolved", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));
    const result = await checkEndpoint(
      "hospitality-site",
      "https://hospitality.mattbutlerengineering.com",
      {
        fetchFn,
      }
    );
    expect(result).toMatchObject({
      name: "hospitality-site",
      url: "https://hospitality.mattbutlerengineering.com",
      httpCode: 0,
      status: "unreachable",
    });
    expect(typeof result.latencyMs).toBe("number");
  });

  it("returns healthy status with a matching pattern", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("<html>ok</html>"),
    });
    const result = await checkEndpoint("marketing-site", "https://mattbutlerengineering.com", {
      pattern: "<html",
      fetchFn,
    });
    expect(result.status).toBe("healthy");
  });
});
