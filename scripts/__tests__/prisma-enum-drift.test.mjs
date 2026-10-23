import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CROSS_NAME_PAIRS,
  findEnumDrift,
  parsePrismaEnums,
  parseZodEnums,
} from "../prisma-enum-drift.mjs";

const REPO_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
// All three services' schemas (#7310): users has zero enums today, but
// reading it anyway means an enum added there lands in the guard without
// anyone remembering to wire it.
const PRISMA_SCHEMAS = [
  "services/agent/prisma/schema.prisma",
  "services/reservations/prisma/schema.prisma",
  "services/users/prisma/schema.prisma",
].map((p) => path.join(REPO_ROOT, p));
const TYPES_SCHEMAS_DIR = path.join(REPO_ROOT, "packages/types/src/schemas");

function realPrismaEnums() {
  const merged = new Map();
  for (const schemaPath of PRISMA_SCHEMAS) {
    for (const [name, values] of parsePrismaEnums(readFileSync(schemaPath, "utf8"))) {
      if (merged.has(name)) {
        throw new Error(`enum ${name} declared in more than one schema.prisma — disambiguate`);
      }
      merged.set(name, values);
    }
  }
  return merged;
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

  it("pairs a cross-named enum through aliases, and still detects its drift", () => {
    const agentPrisma = new Map([["SessionStatus", ["PENDING", "RUNNING"]]]);
    const zod = new Map([["AgentSessionStatus", ["PENDING", "RUNNING", "TIMED_OUT"]]]);
    const aliases = { SessionStatus: "AgentSessionStatus" };

    const agree = findEnumDrift(
      agentPrisma,
      new Map([["AgentSessionStatus", ["PENDING", "RUNNING"]]]),
      aliases
    );
    expect(agree.compared).toEqual(["SessionStatus"]);
    expect(agree.drifted).toEqual([]);

    const drift = findEnumDrift(agentPrisma, zod, aliases);
    expect(drift.drifted).toEqual([
      { name: "SessionStatus", onlyInPrisma: [], onlyInTs: ["TIMED_OUT"] },
    ]);
  });
});

describe("real sources", () => {
  it("every paired Prisma/Zod enum agrees (FloorMaterial, DepositType and the aliased SessionStatus among them)", () => {
    const { compared, drifted } = findEnumDrift(
      realPrismaEnums(),
      realZodEnums(),
      CROSS_NAME_PAIRS
    );
    expect(compared).toContain("FloorMaterial");
    expect(compared).toContain("DepositType");
    expect(compared).toContain("SessionStatus");
    expect(drifted).toEqual([]);
  });

  it("parses a non-empty FloorMaterial vocabulary from the real schema — a parser gone blind cannot report a vacuous pass", () => {
    const prismaValues = realPrismaEnums().get("FloorMaterial");
    expect(prismaValues?.length).toBeGreaterThanOrEqual(5);
    expect(realZodEnums().get("FloorMaterial")?.length).toBeGreaterThanOrEqual(5);
  });

  it("pins the exact unpaired set, so a new Prisma enum forces an explicit pairing decision", () => {
    // These two have no paired `<Name>Schema = z.enum(...)` in
    // packages/types/src/schemas and no CROSS_NAME_PAIRS entry (re-checked
    // for #7310: EmailStatus and VenueRole have zero vocabulary or schema
    // duplicates anywhere in packages/types — the #7308 review verified
    // this with value-set greps, not just name greps). Adding a Prisma enum
    // lands its name here — decide whether it should get a same-named
    // schema, a CROSS_NAME_PAIRS entry, or genuinely stay server-internal.
    const { unpaired } = findEnumDrift(realPrismaEnums(), realZodEnums(), CROSS_NAME_PAIRS);
    expect(unpaired.sort()).toEqual(["EmailStatus", "VenueRole"]);
  });
});
