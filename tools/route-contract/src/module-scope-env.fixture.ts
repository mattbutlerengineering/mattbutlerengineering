/**
 * Fixture for `importFresh` (fastify-owners.ts). Its only content is a
 * module-scope read of `NODE_ENV` — the shape of an environment gate decided
 * when a module is EVALUATED, not when a function in it is called.
 */
export const NODE_ENV_AT_EVALUATION = process.env.NODE_ENV;
