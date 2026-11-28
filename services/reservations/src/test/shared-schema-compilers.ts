import { createRequire } from "node:module";
import type { FastifyServerOptions } from "fastify";

/**
 * Test-only: lets every `buildApp()` in a vitest worker reuse compiled route
 * schemas instead of recompiling them.
 *
 * Profiling `buildApp()` + `app.ready()` — repeated by almost every test via
 * `beforeEach`, and ≈860 ms by 2026-11-28 as the route count grew to 144 —
 * put nearly all of the time in Fastify compiling the same route schemas
 * again for each fresh app: `fast-json-stringify` response serializers and
 * Ajv request validators. The schemas are identical for every app instance
 * in a worker, so both compilers are module-level here:
 *
 * - validators: one `@fastify/ajv-compiler` selector, which pools Ajv
 *   *instances* by external schemas + Ajv options, wrapped in a memo keyed by
 *   the route schema. The pool alone was not enough: `ValidatorCompiler`
 *   ends in `ajv.compile(schema)`, and Ajv's own cache is keyed on the schema
 *   object's identity, which Fastify hands over fresh on every `buildApp()`.
 *   So every route recompiled — 740 ms of each 800 ms `app.ready()` was Ajv
 *   (CPU profile, 144 routes, 2026-11-28);
 * - serializers: a memo keyed by external schemas, serializer options and the
 *   route schema, because the stock serializer selector has no pool.
 *
 * Behaviour is unchanged: the compiled functions are pure in their inputs,
 * and every app still gets its own routes, hooks, rate-limit store and
 * decorations. The one Fastify difference of passing a custom
 * `buildValidator` is that header schemas are no longer lower-cased before
 * compiling; the only header schemas in this service key on the already
 * lower-case `x-session-id`.
 */

type RouteSchemaDef = {
  schema: unknown;
  method?: string;
  url?: string;
  httpPart?: string;
  httpStatus?: string;
  contentType?: string;
};
type Serializer = (data: unknown) => string;
type BuildSerializerFn = (def: RouteSchemaDef) => Serializer;
type SerializerFactory = (externalSchemas: unknown, opts: unknown) => BuildSerializerFn;
type Validator = unknown;
type BuildValidatorFn = (def: RouteSchemaDef) => Validator;
type ValidatorFactory = (externalSchemas: unknown, opts: unknown) => BuildValidatorFn;

const fastifyRequire = createRequire(createRequire(import.meta.url).resolve("fastify"));

const stockValidatorFactory = (fastifyRequire("@fastify/ajv-compiler") as () => ValidatorFactory)();
const stockSerializerFactory = (
  fastifyRequire("@fastify/fast-json-stringify-compiler") as () => SerializerFactory
)();

const serializerCache = new Map<string, Serializer>();
const validatorCache = new Map<string, Validator>();

const memoizedValidatorFactory: ValidatorFactory = (externalSchemas, opts) => {
  const build = stockValidatorFactory(externalSchemas, opts);
  const scope = JSON.stringify([externalSchemas, opts]);
  return (def) => {
    // `ValidatorCompiler.buildValidatorFunction` reads only `schema` — it
    // comments `method`, `url` and `httpPart` out — so the schema and the
    // Ajv scope are the whole cache key. `httpPart` rides along anyway,
    // because Fastify lower-cases header schemas and a future compiler could
    // branch on it.
    const key = `${scope}${JSON.stringify([def.schema, def.httpPart])}`;
    const hit = validatorCache.get(key);
    if (hit) return hit;
    const validator = build(def);
    validatorCache.set(key, validator);
    return validator;
  };
};

const memoizedSerializerFactory: SerializerFactory = (externalSchemas, opts) => {
  const build = stockSerializerFactory(externalSchemas, opts);
  const scope = JSON.stringify([externalSchemas, opts]);
  return (def) => {
    const { schema, httpStatus, contentType } = def;
    const key = `${scope}${JSON.stringify([schema, httpStatus, contentType])}`;
    const hit = serializerCache.get(key);
    if (hit) return hit;
    const serializer = build(def);
    serializerCache.set(key, serializer);
    return serializer;
  };
};

/** Returns Fastify server options that share compiled schemas across apps. */
export function withSharedSchemaCompilers(opts: FastifyServerOptions = {}): FastifyServerOptions {
  return {
    ...opts,
    schemaController: {
      ...opts.schemaController,
      compilersFactory: {
        buildValidator: memoizedValidatorFactory,
        buildSerializer: memoizedSerializerFactory,
        ...opts.schemaController?.compilersFactory,
      } as never,
    },
  };
}
