import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findEnumDrift, parsePrismaEnums, parseZodEnums } from "../prisma-enum-drift.mjs";

const REPO_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const PRISMA_SCHEMA = path.join(REPO_ROOT, "services/reservations/prisma/schema.prisma");
const TYPES_SCHEMAS_DIR = path.join(REPO_ROOT, "packages/types/src/schemas");

function realPrismaEnums() {
  return parsePrismaEnums(readFileSync(PRISMA_SCHEMA, "utf8"));
}

function realZodEnums() {
  const merged = new Map();
  for (const file of readdirSync(TYPES_SCHEMAS_DIR).filter((f) => f.endsWith(".ts"))) {
    const parsed = parseZodEnums(readFileSync(path.join(TYPES_SCHEMAS_DIR, file), "utf8"));
    for (const [name, values] of parsed) merged.set(name, values);
  }
  return merged;
}

describe("parsePrismaEnums", () => {
  it("extracts every enum block with its values, ignoring comments", () => {
    const parsed = parsePrismaEnums(
      [
        "enum FloorMaterial {",
        "  hardwood",
        "  concrete // the popular one",
        "  // a comment line",
        "  marble",
        "}",
        "model Thing { id String @id }",
        "enum Other {",
        "  A",
        "  B",
        "}",
      ].join("\n")
    );
    expect(parsed.get("FloorMaterial")).toEqual(["hardwood", "concrete", "marble"]);
    expect(parsed.get("Other")).toEqual(["A", "B"]);
  });
});

describe("parseZodEnums", () => {
  it("parses a literal z.enum array", () => {
    const parsed = parseZodEnums('export const MenuStatusSchema = z.enum(["DRAFT", "ACTIVE"]);');
    expect(parsed.get("MenuStatus")).toEqual(["DRAFT", "ACTIVE"]);
  });

  it("resolves a z.enum over a same-file const array (the FLOOR_MATERIALS form)", () => {
    const parsed = parseZodEnums(
      'export const FLOOR_MATERIALS = ["hardwood", "tile"] as const;\n' +
        "export const FloorMaterialSchema = z.enum(FLOOR_MATERIALS);"
    );
    expect(parsed.get("FloorMaterial")).toEqual(["hardwood", "tile"]);
  });
});

describe("findEnumDrift", () => {
  const prisma = new Map([["FloorMaterial", ["hardwood", "tile"]]]);

  it("fails when a value exists only in the TS list (the add-without-migration direction)", () => {
    const { drifted } = findEnumDrift(
      prisma,
      new Map([["FloorMaterial", ["hardwood", "tile", "bamboo"]]])
    );
    expect(drifted).toEqual([{ name: "FloorMaterial", onlyInPrisma: [], onlyInTs: ["bamboo"] }]);
  });

  it("fails when a value exists only in the Prisma enum (the drop-without-migration direction)", () => {
    const { drifted } = findEnumDrift(prisma, new Map([["FloorMaterial", ["hardwood"]]]));
    expect(drifted).toEqual([{ name: "FloorMaterial", onlyInPrisma: ["tile"], onlyInTs: [] }]);
  });

  it("treats order differences as agreement", () => {
    const { drifted } = findEnumDrift(prisma, new Map([["FloorMaterial", ["tile", "hardwood"]]]));
    expect(drifted).toEqual([]);
  });

  it("reports a Prisma enum with no same-named schema as unpaired, not drifted", () => {
    const { unpaired, drifted } = findEnumDrift(prisma, new Map());
    expect(unpaired).toEqual(["FloorMaterial"]);
    expect(drifted).toEqual([]);
  });
});

describe("real sources", () => {
  it("every name-paired Prisma/Zod enum agrees (FloorMaterial among them)", () => {
    const { compared, drifted } = findEnumDrift(realPrismaEnums(), realZodEnums());
    expect(compared).toContain("FloorMaterial");
    expect(drifted).toEqual([]);
  });

  it("parses a non-empty FloorMaterial vocabulary from the real schema — a parser gone blind cannot report a vacuous pass", () => {
    const prismaValues = realPrismaEnums().get("FloorMaterial");
    expect(prismaValues?.length).toBeGreaterThanOrEqual(5);
    expect(realZodEnums().get("FloorMaterial")?.length).toBeGreaterThanOrEqual(5);
  });

  it("pins the exact unpaired set, so a new Prisma enum forces an explicit pairing decision", () => {
    // These three have no same-named `<Name>Schema = z.enum(...)` in
    // packages/types/src/schemas (checked 2026-10-22: DepositType and
    // EmailStatus are server-internal, VenueRole's TS shape lives outside the
    // schemas dir). Adding a Prisma enum lands its name here — decide whether
    // it should instead get a same-named schema the guard can compare.
    const { unpaired } = findEnumDrift(realPrismaEnums(), realZodEnums());
    expect(unpaired.sort()).toEqual(["DepositType", "EmailStatus", "VenueRole"]);
  });
});
