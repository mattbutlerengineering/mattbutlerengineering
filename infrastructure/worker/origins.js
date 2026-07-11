/**
 * CORS origin allowlist — the single owner of Access-Control-Allow-Origin.
 *
 * Only these production origins may receive an Access-Control-Allow-Origin
 * header. If a request's Origin header does not match, the header is omitted
 * entirely. Health handlers import from here so the policy has one home;
 * adding or removing an origin is a one-line edit in this module.
 */

const ALLOWED_ORIGINS = new Set([
  "https://mattbutlerengineering.com",
  "https://hospitality.mattbutlerengineering.com",
  "https://gen.mattbutlerengineering.com",
]);

/**
 * Return the request's Origin if it is in the allowlist, or null otherwise.
 */
function corsOriginFor(request) {
  const origin = request.headers.get("Origin");
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}

export { ALLOWED_ORIGINS, corsOriginFor };
