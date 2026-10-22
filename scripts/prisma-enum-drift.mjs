// Guards the hand-duplicated Prisma-enum / Zod-enum pairs (#7286). The Prisma
// `FloorMaterial` enum is a hand-written copy of `FLOOR_MATERIALS` in
// packages/types, and nothing checked that the two agree — add a value to one
// side and typecheck plus every unit test stays green while the write (or
// read) fails at runtime. The same shape exists for every Prisma enum whose
// name has a same-named `<Name>Schema = z.enum(...)` in packages/types, so
// the guard discovers pairs by name instead of hardcoding one list (a
// hardcoded list would be a third copy, the exact disease).
//
// Scope note (#7286 AC-5): discovery-by-name covers FloorMaterial and every
// other duplicated pair without per-enum wiring — 10 pairs at the time of
// writing. A Prisma enum with no same-named TS schema is reported as
// unpaired, not failed: TS vocabularies that deliberately extend a stored
// one use a different name (e.g. `TableDisplayStatusSchema` layers
// display-only states over the stored `TableStatusSchema`), so a name match
// is the signal that the two are meant to agree. The test pins the exact
// unpaired set, so a new Prisma enum forces an explicit pairing decision.

/**
 * Parses `enum <Name> { ... }` blocks out of Prisma schema source.
 * Returns Map<name, string[]>. `@map` annotations are not in use in this
 * repo's schemas; a value line is a bare identifier.
 */
export function parsePrismaEnums(schemaSource) {
  const enums = new Map();
  const blockRe = /^enum\s+(\w+)\s*\{([^}]*)\}/gm;
  for (const [, name, body] of schemaSource.matchAll(blockRe)) {
    const values = body
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, "").trim())
      .filter((line) => /^\w+$/.test(line));
    enums.set(name, values);
  }
  return enums;
}

/**
 * Parses `export const <Name>Schema = z.enum([...])` and
 * `export const <Name>Schema = z.enum(IDENT)` (resolving
 * `IDENT = [...] as const` in the same source) out of TS source.
 * Returns Map<schemaBaseName, string[]> — the key is the name WITHOUT the
 * `Schema` suffix, so it lines up with Prisma enum names.
 */
export function parseZodEnums(tsSource) {
  const constArrays = new Map();
  const constRe = /export const (\w+)\s*=\s*(\[[^\]]*\])\s*as const/g;
  for (const [, name, arrayLiteral] of tsSource.matchAll(constRe)) {
    constArrays.set(name, extractStrings(arrayLiteral));
  }

  const schemas = new Map();
  const schemaRe = /export const (\w+)Schema\s*=\s*z\.enum\(\s*(\[[^\]]*\]|\w+)\s*\)/g;
  for (const [, baseName, arg] of tsSource.matchAll(schemaRe)) {
    if (arg.startsWith("[")) {
      schemas.set(baseName, extractStrings(arg));
    } else if (constArrays.has(arg)) {
      schemas.set(baseName, constArrays.get(arg));
    }
    // An identifier that resolves to nothing in the same file is skipped:
    // the pair then reports as unpaired, which surfaces in the test's
    // discovery assertion instead of silently passing.
  }
  return schemas;
}

function extractStrings(arrayLiteral) {
  return [...arrayLiteral.matchAll(/"([^"]+)"|'([^']+)'/g)].map(([, d, s]) => d ?? s);
}

/**
 * Pure comparison. Returns { compared, unpaired, drifted } where drifted is
 * [{ name, onlyInPrisma, onlyInTs }]. Order differences are not drift —
 * Postgres enum order matters only for sorting, which nothing here relies on.
 */
export function findEnumDrift(prismaEnums, zodEnums) {
  const compared = [];
  const unpaired = [];
  const drifted = [];

  for (const [name, prismaValues] of prismaEnums) {
    const tsValues = zodEnums.get(name);
    if (!tsValues) {
      unpaired.push(name);
      continue;
    }
    compared.push(name);
    const prismaSet = new Set(prismaValues);
    const tsSet = new Set(tsValues);
    const onlyInPrisma = prismaValues.filter((v) => !tsSet.has(v));
    const onlyInTs = tsValues.filter((v) => !prismaSet.has(v));
    if (onlyInPrisma.length > 0 || onlyInTs.length > 0) {
      drifted.push({ name, onlyInPrisma, onlyInTs });
    }
  }

  return { compared, unpaired, drifted };
}
