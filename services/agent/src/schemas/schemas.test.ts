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
    it("enforces minLength of 1", () => {
      const { minLength } = CreateSessionBodySchema.properties.taskDescription;
      expect(minLength).toBe(1);
    });

    it("enforces maxLength of 10000", () => {
      const { maxLength } = CreateSessionBodySchema.properties.taskDescription;
      expect(maxLength).toBe(10_000);
    });
  });
});

describe("Agent service schema backward compatibility", () => {
  for (const [name, schema] of Object.entries(allSchemas)) {
    const schemaId = schema.$id;

    it(`${name} has no breaking changes`, () => {
      const base = baseline[schemaId];
      if (!base) return; // New schema, no baseline to compare

      const { breaking } = compareSchema(schemaId, base, schema);
      if (breaking.length > 0) {
        throw new Error(
          `Breaking schema changes detected:\n${breaking.map((b) => `  - ${b}`).join("\n")}` +
            "\n\nIf intentional, update baselines: pnpm schema:baseline"
        );
      }
    });
  }
});
