import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RLS_MODELS } from "./venue-scoped-prisma.js";
import { parseRlsDeclarations, MIGRATIONS_DIR } from "./rls-force-coverage.js";

const SCHEMA_PATH = fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url));

/**
 * Parses `model <Name> { ... @@map("<table>") ... }` blocks out of the
 * committed Prisma schema, mapping the Prisma delegate name (the model name
 * with its first letter lowercased — how it appears as `prisma.<delegate>`
 * on the generated client) to its Postgres table name. Models with no
 * `@@map` are skipped; none of the RLS-scoped models omit one (ADR-026 §1
 * verifies the table list against `@@map`, not the Prisma model name).
 */
function parseSchemaModelTableMap(schemaSource: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [, modelName, body] of schemaSource.matchAll(
    /model\s+([A-Za-z][A-Za-z0-9]*)\s*\{([\s\S]*?)\n\}/g
  )) {
    const mapMatch = /@@map\("([a-z_][a-z0-9_]*)"\)/.exec(body ?? "");
    if (!mapMatch?.[1] || !modelName) continue;
    const delegateName = modelName[0]!.toLowerCase() + modelName.slice(1);
    map.set(delegateName, mapMatch[1]);
  }
  return map;
}

describe("RLS_MODELS coverage (#5369 PR 1)", () => {
  const schemaModelTableMap = parseSchemaModelTableMap(readFileSync(SCHEMA_PATH, "utf8"));

  const sqlFiles = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(MIGRATIONS_DIR, entry.name, "migration.sql"))
    .map((path) => readFileSync(path, "utf8"));
  const { enabled } = parseRlsDeclarations(sqlFiles);

  it("maps every RLS_MODELS entry to a schema model with a table the migrations enable RLS on", () => {
    const unmapped = [...RLS_MODELS].filter((model) => !schemaModelTableMap.has(model));
    expect(unmapped).toEqual([]);

    const notEnabled = [...RLS_MODELS]
      .map((model) => schemaModelTableMap.get(model)!)
      .filter((table) => !enabled.has(table));
    expect(notEnabled).toEqual([]);
  });

  it("has an RLS_MODELS entry for every RLS-enabled table — a new RLS table with no tripwire coverage fails here", () => {
    const coveredTables = new Set([...RLS_MODELS].map((model) => schemaModelTableMap.get(model)));
    const uncovered = [...enabled].filter((table) => !coveredTables.has(table));
    expect(uncovered).toEqual([]);
  });
});
