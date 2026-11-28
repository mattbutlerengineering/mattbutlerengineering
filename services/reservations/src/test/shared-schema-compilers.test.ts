import { describe, expect, it } from "vitest";
import { withSharedSchemaCompilers } from "./shared-schema-compilers.js";

type RouteSchemaDef = {
  schema: unknown;
  method?: string;
  url?: string;
  httpPart?: string;
};
type ValidateFn = ((data: unknown) => boolean) & { errors?: unknown };

/**
 * Pulls the factories out of the Fastify server options the helper returns,
 * which is the same object Fastify's schemaController reads.
 */
function compilers() {
  const controller = withSharedSchemaCompilers().schemaController as {
    compilersFactory: {
      buildValidator: (externalSchemas: unknown, opts: unknown) => (def: RouteSchemaDef) => unknown;
      buildSerializer: (
        externalSchemas: unknown,
        opts: unknown
      ) => (def: { schema: unknown; httpStatus?: string }) => (data: unknown) => string;
    };
  };
  return controller.compilersFactory;
}

const BODY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { partySize: { type: "integer", minimum: 1 } },
  required: ["partySize"],
} as const;

describe("withSharedSchemaCompilers", () => {
  it("reuses one compiled validator for the same route schema across apps", () => {
    const { buildValidator } = compilers();
    // Two factory calls stand in for two buildApp() instances in one worker.
    const buildFirstApp = buildValidator({}, { customOptions: {} });
    const buildSecondApp = buildValidator({}, { customOptions: {} });

    const first = buildFirstApp({
      // A fresh object each time, as Fastify hands the compiler on every
      // buildApp(): Ajv's own cache is keyed on object identity, so only a
      // content-keyed memo hits here.
      schema: structuredClone(BODY_SCHEMA),
      method: "POST",
      url: "/api/v1/holds",
      httpPart: "body",
    });
    const second = buildSecondApp({
      schema: structuredClone(BODY_SCHEMA),
      method: "POST",
      url: "/api/v1/holds",
      httpPart: "body",
    });

    expect(second).toBe(first);
  });

  it("still accepts valid bodies and rejects invalid ones", () => {
    const { buildValidator } = compilers();
    const validate = buildValidator(
      {},
      { customOptions: {} }
    )({
      schema: structuredClone(BODY_SCHEMA),
      method: "POST",
      url: "/api/v1/holds",
      httpPart: "body",
    }) as ValidateFn;

    expect(validate({ partySize: 2 })).toBe(true);
    expect(validate({ partySize: 0 })).toBe(false);
    expect(validate({})).toBe(false);

    // Fastify's Ajv defaults strip unknown keys rather than rejecting them
    // (`removeAdditional`), so the assertion is that the key is gone.
    const body: Record<string, unknown> = { partySize: 2, nope: true };
    expect(validate(body)).toBe(true);
    expect(body).toEqual({ partySize: 2 });
  });

  it("compiles a different validator for a different schema", () => {
    const { buildValidator } = compilers();
    const build = buildValidator({}, { customOptions: {} });

    const forParty = build({
      schema: structuredClone(BODY_SCHEMA),
      method: "POST",
      url: "/api/v1/holds",
      httpPart: "body",
    }) as ValidateFn;
    const forName = build({
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" } },
        required: ["name"],
      },
      method: "POST",
      url: "/api/v1/holds",
      httpPart: "body",
    }) as ValidateFn;

    expect(forName).not.toBe(forParty);
    expect(forParty({ partySize: 2 })).toBe(true);
    expect(forParty({ name: "x" })).toBe(false);
    expect(forName({ name: "x" })).toBe(true);
    expect(forName({ partySize: 2 })).toBe(false);
  });

  it("keeps validators separate per external-schema scope", () => {
    const { buildValidator } = compilers();
    const plain = buildValidator(
      {},
      { customOptions: {} }
    )({
      schema: structuredClone(BODY_SCHEMA),
      httpPart: "body",
    });
    const coerced = buildValidator(
      {},
      { customOptions: { coerceTypes: true } }
    )({
      schema: structuredClone(BODY_SCHEMA),
      httpPart: "body",
    });

    expect(coerced).not.toBe(plain);
  });
});
