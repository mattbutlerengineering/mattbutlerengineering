import { describe, it, expect, vi } from "vitest";
import { listRunArtifacts, downloadArtifactZip } from "./artifact-ops.js";
import type { SyncHttp } from "./sync-http.js";
import type { SyncBinaryHttp } from "./sync-http.js";

const BASE_OPTS = { token: "gho_test", owner: "owner", repoName: "repo" };

describe("listRunArtifacts", () => {
  it("maps the REST artifacts list to a camelCase shape", () => {
    const http: SyncHttp = vi.fn().mockReturnValue({
      status: 200,
      body: JSON.stringify({
        total_count: 2,
        artifacts: [
          { id: 1, name: "test-results-node22", size_in_bytes: 1024, expired: false },
          { id: 2, name: "test-results-node22", size_in_bytes: 512, expired: true },
        ],
      }),
    });

    const result = listRunArtifacts(999, { ...BASE_OPTS, http });

    expect(result).toEqual([
      { id: 1, name: "test-results-node22", sizeInBytes: 1024, expired: false },
      { id: 2, name: "test-results-node22", sizeInBytes: 512, expired: true },
    ]);
    const [req] = (http as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toBe(
      "https://api.github.com/repos/owner/repo/actions/runs/999/artifacts?per_page=100"
    );
    expect(req.headers.authorization).toBe("Bearer gho_test");
  });

  it("returns an empty array when a run has no artifacts", () => {
    const http: SyncHttp = vi
      .fn()
      .mockReturnValue({ status: 200, body: JSON.stringify({ total_count: 0, artifacts: [] }) });

    expect(listRunArtifacts(999, { ...BASE_OPTS, http })).toEqual([]);
  });
});

describe("downloadArtifactZip", () => {
  it("returns the decoded response body as a Buffer on 200", () => {
    const original = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const binaryHttp: SyncBinaryHttp = vi
      .fn()
      .mockReturnValue({ status: 200, bodyBase64: original.toString("base64") });

    const result = downloadArtifactZip(123, { ...BASE_OPTS, binaryHttp });

    expect(result.equals(original)).toBe(true);
    const [req] = (binaryHttp as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toBe("https://api.github.com/repos/owner/repo/actions/artifacts/123/zip");
    expect(req.headers.authorization).toBe("Bearer gho_test");
  });

  it("throws a clear error on a non-200 response", () => {
    const binaryHttp: SyncBinaryHttp = vi.fn().mockReturnValue({ status: 410, bodyBase64: "" });

    expect(() => downloadArtifactZip(123, { ...BASE_OPTS, binaryHttp })).toThrow(/410/);
  });
});
