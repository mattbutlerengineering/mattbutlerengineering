import { createRequire } from "node:module";
import type { FastifyServerOptions } from "fastify";

/**
 * Test-only: lets every `buildApp()` in a vitest worker reuse compiled route
 * schemas instead of recompiling them.
 *
 * Profiling `buildApp()` + `app.ready()` (≈280 ms, repeated by almost every
 * test via `beforeEach`) put ~70% of the time in Fastify compiling the same
 * route schemas again for each fresh app: `fast-json-stringify` response
 * serializers (~42%) and Ajv request validators (~30%). The schemas are
 * identical for every app instance in a worker, so both compilers are
 * module-level here:
 *
 * - validators: one `@fastify/ajv-compiler` selector, which already pools
 *   compilers keyed by the external schemas + Ajv options;
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
  httpStatus?: string;
  contentType?: string;
};
type Serializer = (data: unknown) => string;
type BuildSerializerFn = (def: RouteSchemaDef) => Serializer;
type SerializerFactory = (externalSchemas: unknown, opts: unknown) => BuildSerializerFn;
type ValidatorFactory = (externalSchemas: unknown, opts: unknown) => unknown;

const fastifyRequire = createRequire(createRequire(import.meta.url).resolve("fastify"));

const validatorFactory = (fastifyRequire("@fastify/ajv-compiler") as () => ValidatorFactory)();
const stockSerializerFactory = (
  fastifyRequire("@fastify/fast-json-stringify-compiler") as () => SerializerFactory
)();

const serializerCache = new Map<string, Serializer>();

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
        buildValidator: validatorFactory,
        buildSerializer: memoizedSerializerFactory,
        ...opts.schemaController?.compilersFactory,
      } as never,
    },
  };
}
