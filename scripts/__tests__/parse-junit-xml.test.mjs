import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJUnitXml } from "../parse-junit-xml.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, "fixtures");

describe("parseJUnitXml", () => {
  it("parses a stable passing testcase as passed: true", () => {
    const xml = readFileSync(resolve(FIXTURES, "junit-sample.xml"), "utf-8");
    const results = parseJUnitXml(xml);
    const stable = results.find((r) => r.testName.includes("stable test"));
    expect(stable).toEqual({
      testName: "scripts/__tests__/example.test.mjs > suite > stable test",
      passed: true,
    });
  });

  it("parses a testcase with a <failure> child as passed: false", () => {
    const xml = readFileSync(resolve(FIXTURES, "junit-sample.xml"), "utf-8");
    const results = parseJUnitXml(xml);
    const flaky = results.find((r) => r.testName.includes("flaky test"));
    expect(flaky).toEqual({
      testName: "scripts/__tests__/example.test.mjs > suite > flaky test",
      passed: false,
    });
  });

  it("parses a testcase with an <error> child as passed: false", () => {
    const xml = readFileSync(resolve(FIXTURES, "junit-sample.xml"), "utf-8");
    const results = parseJUnitXml(xml);
    const errored = results.find((r) => r.testName.includes("errored test"));
    expect(errored).toEqual({
      testName: "scripts/__tests__/example.test.mjs > suite > errored test",
      passed: false,
    });
  });

  it("excludes a testcase with a <skipped/> child entirely", () => {
    const xml = readFileSync(resolve(FIXTURES, "junit-sample.xml"), "utf-8");
    const results = parseJUnitXml(xml);
    const skipped = results.find((r) => r.testName.includes("skipped test"));
    expect(skipped).toBeUndefined();
  });

  it("returns exactly 3 entries from the 4-testcase fixture (skip excluded)", () => {
    const xml = readFileSync(resolve(FIXTURES, "junit-sample.xml"), "utf-8");
    const results = parseJUnitXml(xml);
    expect(results).toHaveLength(3);
  });

  it("returns an empty array for an empty file", () => {
    const xml = readFileSync(resolve(FIXTURES, "junit-empty.xml"), "utf-8");
    expect(parseJUnitXml(xml)).toEqual([]);
  });

  it("returns an empty array for null/undefined input", () => {
    expect(parseJUnitXml(null)).toEqual([]);
    expect(parseJUnitXml(undefined)).toEqual([]);
  });
});
