import { createProblemDetails } from "@mbe/types";

/**
 * The 500 body these route mocks send, in the shape the services actually send.
 *
 * ADR-008 makes RFC 7807 problem details the single wire error shape; the transitional
 * `{ "error": "…" }` envelope was removed once every consumer migrated (#3348). A mock still
 * sending the legacy body *passes* — `parseProblemDetails`'s `extractDetail` falls back through
 * `obj.detail ?? obj.message ?? obj.error` — so the spec silently exercises the degradation path
 * instead of production's wire (#5278).
 *
 * Built through `createProblemDetails` itself (the helper `@mbe/service-bootstrap`'s
 * `errorHandlerPlugin` calls on every thrown error) so a future change to the envelope reaches
 * these mocks by construction rather than by someone remembering to update them. `classifyError`
 * titles a bare 500 "Internal Server Error".
 */
export const SERVER_ERROR_BODY = JSON.stringify(
  createProblemDetails(500, "Internal Server Error", "server error")
);
