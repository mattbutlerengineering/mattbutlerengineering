import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SessionSchema,
  SessionEventSchema,
  CreateSessionBodySchema,
  PaginationSchema,
  ErrorSchema,
} from "./index.js";
import { compareSchema } from "@mbe/types/schema-compat";

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(
  readFileSync(join(__dirname, "schema-baseline.json"), "utf-8")
);

const allSchemas = {
  SessionSchema,
  SessionEventSchema,
  CreateSessionBodySchema,
  PaginationSchema,
  ErrorSchema,
};

describe("Agent service schemas", () => {
  it("SessionSchema matches snapshot", () => {
    expect(SessionSchema).toMatchSnapshot();
  });

  it("SessionEventSchema matches snapshot", () => {
    expect(SessionEventSchema).toMatchSnapshot();
  });

  it("CreateSessionBodySchema matches snapshot", () => {
    expect(CreateSessionBodySchema).toMatchSnapshot();
  });

  it("PaginationSchema matches snapshot", () => {
    expect(PaginationSchema).toMatchSnapshot();
  });

  it("ErrorSchema matches snapshot", () => {
    expect(ErrorSchema).toMatchSnapshot();
  });

  describe("CreateSessionBodySchema taskDescription limits", () => {
    const schemaObj = CreateSessionBodySchema as Record<string, unknown>;
    const props = schemaObj.properties as Record<string, Record<string, unknown>>;

    it("enforces minLength of 1", () => {
      expect(props.taskDescription.minLength).toBe(1);
    });

    it("enforces maxLength of 10000", () => {
      expect(props.taskDescription.maxLength).toBe(10_000);
    });
  });
});

describe("Agent service schema backward compatibility", () => {
  for (const [name, schema] of Object.entries(allSchemas)) {
    const schemaObj = schema as Record<string, unknown>;
    const schemaId = schemaObj.$id as string;

    it(`${name} has no breaking changes`, () => {
      const base = baseline[schemaId];
      if (!base) return; // New schema, no baseline to compare

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { breaking } = compareSchema(schemaId, base, schemaObj as any);
      if (breaking.length > 0) {
        throw new Error(
          `Breaking schema changes detected:\n${breaking.map((b: string) => `  - ${b}`).join("\n")}` +
            "\n\nIf intentional, update baselines: pnpm schema:baseline"
        );
      }
    });
  }
});
