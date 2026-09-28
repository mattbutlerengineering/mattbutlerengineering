import { describe, it, expect } from "vitest";

import { createEdgeOwner, EDGE_TERMINAL_PATHS } from "./edge-owner.js";
import { PLACEHOLDER } from "./types.js";

const edge = createEdgeOwner();

describe("createEdgeOwner", () => {
  it.each(EDGE_TERMINAL_PATHS)("terminates %s at the edge", async (path) => {
    expect((await edge.classify("GET", path)).disposition).toBe("edge-terminal");
    expect(await edge.answers("GET", path)).toBe(true);
  });

  it.each([
    ["GET", `/api/v1/venues/${PLACEHOLDER}`],
    ["POST", "/api/v1/floor-plans/tables/positions"],
    ["GET", `/public/v1/venues/${PLACEHOLDER}`],
  ] as const)("forwards %s %s to the DO origin", async (method, path) => {
    expect((await edge.classify(method, path)).disposition).toBe("forwarded-to-origin");
    // Forwarding is NOT ownership: a Fastify service still has to answer it.
    expect(await edge.answers(method, path)).toBe(false);
  });

  it.each([
    ["GET", "/"],
    ["GET", "/about"],
    ["GET", `/v1/sessions/${PLACEHOLDER}`],
  ] as const)("hands %s %s to the static SPA", async (method, path) => {
    expect((await edge.classify(method, path)).disposition).toBe("static-spa");
    expect(await edge.answers(method, path)).toBe(false);
  });

  // The measured trap. `handleHealthSystem` probes every service over the
  // origin `fetch` AND every SPA over its Service Binding as part of answering
  // — so "which stub fired" says `static-spa`, which is wrong, and wrong in
  // the direction that hides a defect. This asserts both stubs really did run
  // and that the verdict is still `edge-terminal`, which is only possible if
  // the classifier reads the returned response.
  it("classifies /health/system by the returned response, not by which stub fired", async () => {
    const probe = await edge.classify("GET", "/health/system");

    expect(probe.originFetchCalls).toBeGreaterThan(0);
    expect(probe.staticBindingCalls).toBeGreaterThan(0);
    expect(probe.disposition).toBe("edge-terminal");
  });

  it("restores globalThis.fetch after a probe", async () => {
    const before = globalThis.fetch;
    await edge.classify("GET", "/health/system");
    expect(globalThis.fetch).toBe(before);
  });
});
