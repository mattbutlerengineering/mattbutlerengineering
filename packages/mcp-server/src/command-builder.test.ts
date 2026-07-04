import { describe, it, expect, vi } from "vitest";
import { psqlQuery, ghJson, doctlJson, pulumiJson } from "./command-builder.js";

describe("psqlQuery", () => {
  it("invokes psql via argv — dbUrl and sql are separate args, never concatenated into a string", () => {
    const run = vi.fn().mockReturnValue("row1\nrow2");

    const result = psqlQuery("postgresql://localhost/test", "SELECT 1;", run);

    expect(run).toHaveBeenCalledWith("psql", [
      "postgresql://localhost/test",
      "-t",
      "-c",
      "SELECT 1;",
    ]);
    expect(result).toBe("row1\nrow2");
  });

  it("rejects a dbUrl containing a path-traversal sequence", () => {
    const run = vi.fn();

    expect(() => psqlQuery("postgresql://localhost/../etc/passwd", "SELECT 1;", run)).toThrow(
      /invalid|traversal/i
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a sql statement containing a path-traversal sequence", () => {
    const run = vi.fn();

    expect(() => psqlQuery("postgresql://localhost/test", "SELECT '../secret';", run)).toThrow(
      /invalid|traversal/i
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("does not shell-quote the dbUrl — a value with embedded quotes/semicolons passes through as a single argv element", () => {
    const run = vi.fn().mockReturnValue("");
    const maliciousUrl = 'postgresql://x"; rm -rf / #';

    psqlQuery(maliciousUrl, "SELECT 1;", run);

    expect(run).toHaveBeenCalledWith("psql", [maliciousUrl, "-t", "-c", "SELECT 1;"]);
  });
});

describe("ghJson", () => {
  it("invokes gh via argv with the provided args", () => {
    const run = vi.fn().mockReturnValue("[]");

    const result = ghJson(["run", "list", "--limit", "10", "--json", "conclusion"], run);

    expect(run).toHaveBeenCalledWith("gh", [
      "run",
      "list",
      "--limit",
      "10",
      "--json",
      "conclusion",
    ]);
    expect(result).toBe("[]");
  });
});

describe("doctlJson", () => {
  it("invokes doctl via argv with the provided args", () => {
    const run = vi.fn().mockReturnValue("");

    doctlJson(["apps", "list", "--no-header"], run);

    expect(run).toHaveBeenCalledWith("doctl", ["apps", "list", "--no-header"]);
  });
});

describe("pulumiJson", () => {
  it("invokes pulumi via argv with the provided args", () => {
    const run = vi.fn().mockReturnValue("{}");

    const result = pulumiJson(["stack", "output", "--json"], run);

    expect(run).toHaveBeenCalledWith("pulumi", ["stack", "output", "--json"]);
    expect(result).toBe("{}");
  });
});
