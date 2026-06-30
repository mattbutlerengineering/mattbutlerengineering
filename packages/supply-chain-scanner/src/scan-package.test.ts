import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanPackage, computeVerdict } from "./scan-package.js";
import type { Finding } from "./types.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const scan = (name: string) => scanPackage(join(fixtures, name));

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
