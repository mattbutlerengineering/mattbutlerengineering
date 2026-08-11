import { describe, it, expect } from "vitest";
import { formatPrMetadataOutputs } from "../resolve-pr-metadata.mjs";

describe("formatPrMetadataOutputs", () => {
  it("formats title/body as GITHUB_OUTPUT multiline blocks and the rest as plain lines", () => {
    const output = formatPrMetadataOutputs(
      {
        title: "chore: record production health metrics",
        body: "Automated production health snapshot.",
        headRefOid: "abc1234",
        baseRefName: "main",
        isCrossRepository: false,
      },
      "DELIM"
    );

    expect(output).toBe(
      [
        "title<<DELIM",
        "chore: record production health metrics",
        "DELIM",
        "body<<DELIM",
        "Automated production health snapshot.",
        "DELIM",
        "head_sha=abc1234",
        "base_ref=main",
        "is_fork=false",
      ].join("\n")
    );
  });

  it("defaults missing title/body to empty strings rather than the literal string undefined", () => {
    const output = formatPrMetadataOutputs(
      { headRefOid: "abc1234", baseRefName: "main", isCrossRepository: true },
      "DELIM"
    );

    expect(output).toContain("title<<DELIM\n\nDELIM");
    expect(output).toContain("body<<DELIM\n\nDELIM");
    expect(output).toContain("is_fork=true");
  });
});
