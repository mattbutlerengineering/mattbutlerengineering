/**
 * Register one Fastify route from one endpoint definition (`@mbe/types`
 * `defineEndpoint`). The definition supplies method, path and every schema;
 * the route supplies only server-side concerns — OpenAPI docs metadata,
 * preHandlers and the handler.
 */
import type {
  FastifyInstance,
  FastifySchema,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
  RouteHandlerMethod,
  RouteShorthandOptions,
} from "fastify";
import {
  isProblemResponse,
  successResponse,
  toRequestJsonSchema,
  toResponseJsonSchema,
  type AnyEndpointDefinition,
  type EndpointResponses,
  type EndpointRouteGeneric,
} from "@mbe/types";

/** OpenAPI docs metadata — server-only, so it lives at the route, never in the definition. */
export interface EndpointDocs {
  readonly summary?: string;
  readonly operationId?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly security?: ReadonlyArray<Record<string, readonly string[]>>;
}

type RouteGenericOf<D extends AnyEndpointDefinition> =
  EndpointRouteGeneric<D> extends RouteGenericInterface ? EndpointRouteGeneric<D> : never;

export interface RegisterEndpointOptions<D extends AnyEndpointDefinition> {
  readonly docs: EndpointDocs;
  readonly preHandler?: RouteShorthandOptions<
    RawServerDefault,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    RouteGenericOf<D>
  >["preHandler"];
  readonly handler: RouteHandlerMethod<
    RawServerDefault,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    RouteGenericOf<D>
  >;
}

/** The URL relative to the plugin prefix; `""` becomes `"/"` (today's spelling). */
function relativeUrl(prefix: string, def: AnyEndpointDefinition): string {
  const rest = def.path.startsWith(prefix) ? def.path.slice(prefix.length) : undefined;
  if (rest === undefined || (rest !== "" && !rest.startsWith("/"))) {
    throw new Error(
      `${def.method} ${def.path}: endpoint path is not under the plugin prefix "${prefix}"`
    );
  }
  return rest === "" ? "/" : rest;
}

function assertParamsMatchPath(def: AnyEndpointDefinition): void {
  const segments = [...def.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]).sort();
  const keys = Object.keys(def.params?.shape ?? {}).sort();
  if (segments.join(",") !== keys.join(",")) {
    throw new Error(
      `${def.method} ${def.path}: params keys [${keys.join(", ")}] do not match path segments [${segments.join(", ")}]`
    );
  }
}

function responseSchemas(responses: EndpointResponses): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(responses).map(([status, response]) => {
      const description =
        response.description === undefined ? {} : { description: response.description };
      if (isProblemResponse(response)) return [status, { ...description, $ref: "Error#" }];
      if (response.body === null) return [status, { ...description, type: "null" }];
      return [status, { ...description, ...toResponseJsonSchema(response.body) }];
    })
  );
}

/**
 * Register `def` on `fastify` (a plugin instance whose prefix is a prefix of
 * `def.path`). Throws synchronously — failing the service boot — when the
 * path is not under the prefix, when there is not exactly one 2xx response,
 * or when `params` keys do not match the path's `:segments`. Validation and
 * serialization stay Fastify's.
 */
export function registerEndpoint<D extends AnyEndpointDefinition>(
  fastify: FastifyInstance,
  def: D,
  options: RegisterEndpointOptions<D>
): void {
  const url = relativeUrl(fastify.prefix, def);
  assertParamsMatchPath(def);
  successResponse(def);

  const schema: FastifySchema = {
    ...options.docs,
    ...(def.params && { params: toRequestJsonSchema(def.params) }),
    ...(def.query && { querystring: toRequestJsonSchema(def.query) }),
    ...(def.body && { body: toRequestJsonSchema(def.body) }),
    response: responseSchemas(def.responses),
  };

  fastify.route<RouteGenericOf<D>>({
    method: def.method,
    url,
    schema,
    ...(options.preHandler && { preHandler: options.preHandler }),
    handler: options.handler,
  });
}
