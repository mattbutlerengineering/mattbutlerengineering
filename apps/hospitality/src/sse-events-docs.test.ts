import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { SSE_EVENT_NAMES } from "@mbe/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARCHITECTURE_DOC = resolve(__dirname, "../docs/ARCHITECTURE.md");

/** Event names in the first column of the "Event Types Reference" table. */
function documentedEventNames(markdown: string): string[] {
  const section = markdown.slice(markdown.indexOf("### Event Types Reference"));
  const end = section.indexOf("\n---");
  const rows = (end === -1 ? section : section.slice(0, end)).split("\n");
  return rows.flatMap((row) => {
    const match = /^\|\s*`([a-z-]+:[a-z-]+)`\s*\|/.exec(row);
    return match?.[1] ? [match[1]] : [];
  });
}

describe("SSE event docs", () => {
  it("ARCHITECTURE.md Event Types Reference lists exactly SSE_EVENT_CATALOG's names", () => {
    const documented = documentedEventNames(readFileSync(ARCHITECTURE_DOC, "utf8"));
    expect([...documented].sort()).toEqual([...SSE_EVENT_NAMES].sort());
  });
});
