import { describe, it, expect, vi } from "vitest";
import { createTransportRunner } from "./transport.js";
import type { ExecRunner } from "./exec-runner.js";
import type { SyncHttp } from "./sync-http.js";

describe("createTransportRunner", () => {
  it("uses the exec transport when the probe reports gh available", () => {
    const execRunner: ExecRunner = vi.fn().mockReturnValue("exec output");
    const http: SyncHttp = vi.fn();
    const run = createTransportRunner({ probe: () => true, runner: execRunner, http });

    expect(run("gh", ["issue", "list"])).toBe("exec output");
    expect(execRunner).toHaveBeenCalledTimes(1);
    expect(http).not.toHaveBeenCalled();
  });

  it("uses the REST transport when the probe reports gh unavailable", () => {
    const execRunner: ExecRunner = vi.fn();
    const http: SyncHttp = vi.fn().mockReturnValue({ status: 200, body: "[]" });
    const run = createTransportRunner({
      probe: () => false,
      runner: execRunner,
      http,
      token: "gho_test",
      owner: "owner",
      repoName: "repo",
    });

    expect(run("gh", ["issue", "list", "--json", "number"])).toBe("[]");
    expect(execRunner).not.toHaveBeenCalled();
    expect(http).toHaveBeenCalledTimes(1);
  });
});
