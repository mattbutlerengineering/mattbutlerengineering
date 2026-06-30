import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { run, type CliIo } from "./run-cli.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = { stdout: (t) => out.push(t), stderr: (t) => err.push(t) };
  return { io, out, err };
}

describe("run (CLI core)", () => {
  it("exits 2 with usage when no path given", () => {
    const { io, err } = capture();
    expect(run(["node", "cli"], io)).toBe(2);
    expect(err.join("")).toContain("usage");
  });

  it("exits 0 and prints JSON for a clean package", () => {
    const { io, out } = capture();
    expect(run(["node", "cli", join(fixtures, "clean")], io)).toBe(0);
    expect(JSON.parse(out.join("")).verdict).toBe("pass");
  });

  it("exits 1 on a block verdict", () => {
    const { io, out } = capture();
    expect(run(["node", "cli", join(fixtures, "malicious-high")], io)).toBe(1);
    expect(JSON.parse(out.join("")).verdict).toBe("block");
  });
});
