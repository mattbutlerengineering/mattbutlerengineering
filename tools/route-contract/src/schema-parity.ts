/**
 * Schema parity — the second half of the route contract.
 *
 * The method+path join (`route-contract.ts`) proves a client URL has an
 * owner. It cannot see the body the client sends, the query names it uses,
 * or the response shape it validates — three of the seven recorded drift
 * incidents (#4826, #4862, #2642) were exactly that. This module compares
 * what the client DECLARES with what the owning route REGISTERS, after one
 * normalization:
 *
 * - client side: Zod schemas captured by the driver (`client-inventory.ts`),
 *   converted with the same `toRequestJsonSchema` / `toResponseJsonSchema`
 *   the server uses;
 * - route side: the reservations test boot's `app.swagger()` document — the
 *   artifact the "OpenAPI output unchanged" constraint protects.
 *
 * Everything here is pure and takes plain data, so every normalization rule
 * is unit-tested against a deliberately drifted fixture.
 */

export type Facet = "body" | "query" | "response";

export type JsonSchema = Record<string, unknown>;

/** `$ref` target → schema, keyed by every spelling a ref can take. */
export type RefTable = Readonly<Record<string, JsonSchema>>;

export interface ParityMismatch {
  readonly facet: Facet;
  readonly detail: string;
}

/** Keys that document a schema rather than constrain it. */
const DOC_KEYS = new Set(["description", "$id", "$schema", "title", "examples"]);
/** Keys every derived schema has stripped (`json-schema.ts` stripAdditionalProperties). */
const STRIPPED_KEYS = new Set(["additionalProperties", "propertyNames"]);
/** Refs nest at most a few levels; this only stops a cyclic table looping forever. */
const MAX_REF_DEPTH = 16;

const isObject = (value: unknown): value is JsonSchema =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Builds the ref table from an OpenAPI document's `components.schemas`.
 * @fastify/swagger renames each registered schema to `def-N` and keeps its
 * `$id` as `title`, so both `#/components/schemas/def-7` (swagger output) and
 * `Guest#` (Fastify / `toResponseJsonSchema` output) resolve.
 */
export function refTableFromOpenApi(doc: { components?: { schemas?: unknown } }): RefTable {
  const schemas = isObject(doc.components?.schemas) ? doc.components.schemas : {};
  const table: Record<string, JsonSchema> = {};
  for (const [key, schema] of Object.entries(schemas)) {
    if (!isObject(schema)) continue;
    table[`#/components/schemas/${key}`] = schema;
    const id = typeof schema.title === "string" ? schema.title : schema.$id;
    if (typeof id === "string") table[`${id}#`] = schema;
  }
  return table;
}

/** `{ anyOf: [X, { type: "null" }] }` / `{ type: [T, "null"] }` → `{ ...X, nullable: true }`. */
function unifyNullable(schema: JsonSchema): JsonSchema {
  const { anyOf, type } = schema;
  if (Array.isArray(anyOf) && anyOf.length === 2) {
    const nonNull = anyOf.filter((s) => !(isObject(s) && s.type === "null"));
    const only = nonNull[0];
    if (nonNull.length === 1 && isObject(only)) {
      const { anyOf: _anyOf, ...rest } = schema;
      return { ...rest, ...only, nullable: true };
    }
  }
  if (Array.isArray(type) && type.includes("null")) {
    const remaining = type.filter((t) => t !== "null");
    if (remaining.length === 1) return { ...schema, type: remaining[0], nullable: true };
  }
  return schema;
}

/**
 * Canonical form for comparison: refs resolved, documentation dropped,
 * nullable spelled one way, `required` sorted — and dropped on the response
 * side, where routes never declare it (the OpenAPI constraint keeps it that
 * way, and emitting it would make fast-json-stringify 500 on a missing field).
 */
export function normalize(schema: unknown, facet: Facet, refs: RefTable, depth = 0): unknown {
  if (Array.isArray(schema)) return schema.map((item) => normalize(item, facet, refs, depth));
  if (!isObject(schema)) return schema;

  if (typeof schema.$ref === "string") {
    const target = refs[schema.$ref];
    if (target === undefined || depth >= MAX_REF_DEPTH) return { $ref: schema.$ref };
    return normalize(target, facet, refs, depth + 1);
  }

  const unified = unifyNullable(schema);
  const result: JsonSchema = {};
  for (const [key, value] of Object.entries(unified)) {
    if (DOC_KEYS.has(key) || STRIPPED_KEYS.has(key)) continue;
    if (key === "required" && Array.isArray(value)) {
      if (facet !== "response") result[key] = [...value].sort();
      continue;
    }
    if (key === "properties" && isObject(value)) {
      // Property names are data, not schema keywords — never filter them.
      result[key] = Object.fromEntries(
        Object.entries(value).map(([name, prop]) => [name, normalize(prop, facet, refs, depth)])
      );
      continue;
    }
    result[key] = normalize(value, facet, refs, depth);
  }
  return result;
}

const escapePointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");

/** JSON pointer of the first difference (keys in sorted order), or null when deep-equal. */
export function firstDifference(a: unknown, b: unknown, pointer = ""): string | null {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return pointer || "/";
    for (let i = 0; i < a.length; i++) {
      const diff = firstDifference(a[i], b[i], `${pointer}/${i}`);
      if (diff !== null) return diff;
    }
    return null;
  }
  if (isObject(a) && isObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      const diff = firstDifference(a[key], b[key], `${pointer}/${escapePointer(key)}`);
      if (diff !== null) return diff;
    }
    return null;
  }
  return a === b ? null : pointer || "/";
}

interface OpenApiParameter {
  readonly in?: string;
  readonly name?: string;
  readonly required?: boolean;
  readonly schema?: unknown;
}

/** Swagger flattens a querystring schema into `parameters`; rebuild the object. */
export function queryFromParameters(
  parameters: readonly OpenApiParameter[] | undefined
): JsonSchema | undefined {
  const query = (parameters ?? []).filter((p) => p.in === "query" && typeof p.name === "string");
  if (query.length === 0) return undefined;
  const required = query.filter((p) => p.required === true).map((p) => p.name as string);
  return {
    type: "object",
    properties: Object.fromEntries(query.map((p) => [p.name as string, p.schema ?? {}])),
    ...(required.length > 0 && { required }),
  };
}

export interface OpenApiOperation {
  readonly parameters?: readonly OpenApiParameter[];
  readonly requestBody?: { readonly content?: Record<string, { readonly schema?: unknown }> };
  readonly responses?: Record<
    string,
    {
      readonly description?: string;
      readonly content?: Record<string, { readonly schema?: unknown }>;
    }
  >;
}

const jsonSchemaOf = (
  content: Record<string, { readonly schema?: unknown }> | undefined
): JsonSchema | undefined => {
  const schema = content?.["application/json"]?.schema;
  return isObject(schema) ? schema : undefined;
};

/** The three comparable facets of one swagger operation. */
export function routeFacets(operation: OpenApiOperation): Partial<Record<Facet, JsonSchema>> {
  const success = Object.entries(operation.responses ?? {}).find(([status]) =>
    /^2\d\d$/.test(status)
  );
  return {
    body: jsonSchemaOf(operation.requestBody?.content),
    query: queryFromParameters(operation.parameters),
    response: success ? jsonSchemaOf(success[1].content) : undefined,
  };
}

/** Compare one facet; `null` means parity. */
export function compareFacet(
  facet: Facet,
  client: JsonSchema | undefined,
  route: JsonSchema | undefined,
  refs: RefTable
): ParityMismatch | null {
  if (client === undefined && route === undefined) return null;
  if (client === undefined) {
    return { facet, detail: "client declares no schema; the route registers one" };
  }
  if (route === undefined) {
    return { facet, detail: "route registers no schema; the client declares one" };
  }
  const pointer = firstDifference(normalize(client, facet, refs), normalize(route, facet, refs));
  return pointer === null ? null : { facet, detail: `differs at ${pointer}` };
}
