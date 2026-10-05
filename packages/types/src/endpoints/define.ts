/**
 * Endpoint definitions — the one statement of an HTTP endpoint's wire
 * contract: method, absolute path, params / query / body schemas, and a
 * responses table keyed by status.
 *
 * Definitions are plain Zod data. They carry no JSON Schema, no Fastify
 * types and no OpenAPI prose, so they are safe to import from the client
 * bundle. Two adapters consume the same object: `registerEndpoint`
 * (`@mbe/service-bootstrap`) on the server and `ApiClient.call`
 * (`@mbe/api-client`) on the client.
 */
import type { z } from "zod";
import type { ProblemDetails } from "../api.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** An RFC 7807 problem response (ADR-002/008), registered as `$ref: "Error#"`. */
export interface ProblemResponse {
  readonly kind: "problem";
  readonly description?: string;
}

/** A response with a body schema; `body: null` means no body (e.g. 204). */
export interface BodyResponse {
  readonly description?: string;
  readonly body: z.ZodType | null;
}

export type EndpointResponse = BodyResponse | ProblemResponse;

export type EndpointResponses = { readonly [status: number]: EndpointResponse };

export interface EndpointDefinition<
  M extends HttpMethod = HttpMethod,
  P extends string = string,
  Params extends z.ZodObject | undefined = z.ZodObject | undefined,
  Query extends z.ZodObject | undefined = z.ZodObject | undefined,
  Body extends z.ZodType | undefined = z.ZodType | undefined,
  R extends EndpointResponses = EndpointResponses,
> {
  readonly method: M;
  /** Absolute path in Fastify syntax, e.g. `/api/v1/guests/:id`. */
  readonly path: P;
  readonly params?: Params;
  readonly query?: Query;
  readonly body?: Body;
  readonly responses: R;
}

/** Any endpoint definition — the constraint the adapters accept. */
export type AnyEndpointDefinition = EndpointDefinition;

const SUCCESS_STATUSES = [200, 201, 202, 203, 204, 205, 206] as const;
type SuccessStatus = (typeof SUCCESS_STATUSES)[number];

/** Names of the `:segments` in a Fastify path. */
export type PathParamNames<P extends string> = P extends `${string}:${infer Param}/${infer Rest}`
  ? Param | PathParamNames<`/${Rest}`>
  : P extends `${string}:${infer Param}`
    ? Param
    : never;

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;

type SuccessKey<R> = Extract<keyof R, SuccessStatus>;

type SameKeys<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type ParamsSchemaOf<D> = D extends { readonly params: infer X extends z.ZodObject } ? X : undefined;
type ResponsesOf<D> = D extends { readonly responses: infer X } ? X : never;

/**
 * Compile-time contract checks, surfaced as a required extra argument whose
 * label names the violation (`Expected 2 arguments, but got 1` + the label):
 * `params` keys must equal the path's `:segments`, and there must be exactly
 * one 2xx response.
 */
type DefinitionCheck<D extends AnyEndpointDefinition> = [PathParamNames<D["path"]>] extends [never]
  ? ParamsSchemaOf<D> extends z.ZodObject
    ? [params_declared_but_path_has_no_segment: never]
    : SuccessCheck<ResponsesOf<D>>
  : ParamsSchemaOf<D> extends z.ZodObject<infer Shape>
    ? SameKeys<keyof Shape, PathParamNames<D["path"]>> extends true
      ? SuccessCheck<ResponsesOf<D>>
      : [params_keys_must_equal_path_segments: never]
    : [path_has_segments_but_no_params_schema: never];

type SuccessCheck<R> = [SuccessKey<R>] extends [never]
  ? [exactly_one_2xx_response_required_none_declared: never]
  : true extends IsUnion<SuccessKey<R>>
    ? [exactly_one_2xx_response_required_several_declared: never]
    : [];

/**
 * Declare an endpoint. An identity function that exists for inference and
 * for the compile-time checks: a `:param` without a matching `params` key,
 * or zero / several 2xx responses, fails `tsc`.
 */
export function defineEndpoint<const D extends AnyEndpointDefinition>(
  def: D,
  ..._contractCheck: DefinitionCheck<D>
): D {
  return def;
}

/** Mark a response as an RFC 7807 problem (`$ref: "Error#"`). */
export function problem(description?: string): ProblemResponse {
  return description === undefined ? { kind: "problem" } : { kind: "problem", description };
}

export function isProblemResponse(response: EndpointResponse): response is ProblemResponse {
  return "kind" in response && response.kind === "problem";
}

/**
 * The single 2xx entry of a definition. Throws when there is not exactly
 * one — the runtime backstop for definitions built without
 * `defineEndpoint` (the type check cannot see those).
 */
export function successResponse(def: AnyEndpointDefinition): {
  status: number;
  response: BodyResponse;
} {
  const entries = Object.entries(def.responses).filter(([status]) =>
    (SUCCESS_STATUSES as readonly number[]).includes(Number(status))
  );
  const only = entries.length === 1 ? entries[0] : undefined;
  if (!only || isProblemResponse(only[1])) {
    throw new Error(
      `${def.method} ${def.path}: endpoint definition needs exactly one 2xx body response, found ${entries.length}`
    );
  }
  return { status: Number(only[0]), response: only[1] };
}

// ── Derived types ─────────────────────────────────────────────

type ParamsOf<D> = ParamsSchemaOf<D>;
type QueryOf<D> = D extends { readonly query: infer X extends z.ZodObject } ? X : undefined;
type BodyOf<D> = D extends { readonly body: infer X extends z.ZodType } ? X : undefined;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type Declared<K extends string, S, T> = S extends z.ZodType ? { [P in K]: T } : unknown;

/** What a caller supplies: only the keys the definition declares. */
export type EndpointInput<D extends AnyEndpointDefinition> = Simplify<
  Declared<"params", ParamsOf<D>, z.input<NonNullable<ParamsOf<D>>>> &
    Declared<"query", QueryOf<D>, z.input<NonNullable<QueryOf<D>>>> &
    Declared<"body", BodyOf<D>, z.input<NonNullable<BodyOf<D>>>>
>;

type BodyOutput<Resp> = Resp extends { body: infer B }
  ? B extends z.ZodType
    ? z.output<B>
    : undefined
  : never;

/** The `z.output` of the single 2xx body; `undefined` for `body: null`. */
export type EndpointSuccess<D extends AnyEndpointDefinition> = BodyOutput<
  ResponsesOf<D>[SuccessKey<ResponsesOf<D>> & keyof ResponsesOf<D>]
>;

type ReplyOf<R> =
  | { [K in keyof R]: R[K] extends ProblemResponse ? never : BodyOutput<R[K]> }[keyof R]
  | ProblemDetails;

/**
 * Fastify route generic for a handler of this endpoint. Uses `z.output`
 * because AJV `useDefaults` applies querystring defaults before the handler
 * runs (e.g. `page: "1"`).
 */
export type EndpointRouteGeneric<D extends AnyEndpointDefinition> = Simplify<
  Declared<"Params", ParamsOf<D>, z.output<NonNullable<ParamsOf<D>>>> &
    Declared<"Querystring", QueryOf<D>, z.output<NonNullable<QueryOf<D>>>> &
    Declared<"Body", BodyOf<D>, z.output<NonNullable<BodyOf<D>>>> & {
      Reply: Exclude<ReplyOf<ResponsesOf<D>>, undefined> | ProblemDetails;
    }
>;
