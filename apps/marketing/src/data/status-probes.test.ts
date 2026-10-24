import { describe, it, expect } from "vitest";
import { STATUS_SERVICES, STATUS_SITES, statusProbeFixture } from "./status-probes.js";

// #7385: the ui-quality capture serves a built dist with no backend, so the
// /status page's own probes 502 and were filed as a bugs/failed-request.
describe("statusProbeFixture", () => {
  it("answers every API probe with an ok health payload", () => {
    for (const { url } of STATUS_SERVICES) {
      expect(statusProbeFixture(url, "GET")).toEqual({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", version: "capture" }),
      });
    }
  });

  it("answers every static-site probe with an empty 200", () => {
    for (const { url } of STATUS_SITES) {
      expect(statusProbeFixture(url, "HEAD")).toEqual({ status: 200, body: "" });
    }
  });

  it("leaves requests that are not probes alone", () => {
    expect(statusProbeFixture("/assets/index.js", "GET")).toBeUndefined();
    expect(statusProbeFixture(STATUS_SERVICES[0].url, "HEAD")).toBeUndefined();
  });
});
