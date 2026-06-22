/**
 * CSP policy pure functions — testable outside the Worker runtime.
 *
 * buildCspDirectives: assembles the Content-Security-Policy header value
 *   from a per-request nonce and an optional KV policy override.
 *
 * injectNonceIntoHtml: adds nonce="..." to every <script> tag in an HTML
 *   string. Mirrors what NonceInjector does via HTMLRewriter, but as a
 *   plain string transform so it can be unit-tested in Node.
 *
 * Rollback path:
 *   The edge router reads the CSP policy from KV key "security/csp"
 *   (parsed as JSON: { "directive-name": "value" }).  If the key is
 *   absent or the KV read fails, it falls back to the hardcoded defaults
 *   in buildCspDirectives.  To roll back a bad KV policy, delete the key:
 *
 *     wrangler kv key delete --binding HEALTH_STATE "security/csp"
 *
 *   The next request will use the hardcoded fallback immediately — no
 *   worker redeploy required.
 */

// Single source of truth for the Auth0 tenant origin used in the CSP
// connect-src directive. Must match AUTH_AUTHORITY in Pulumi and docker-compose.
// Re-exported from edge-router.js for backward compatibility.
// To override for a prod tenant: pass auth0Origin in buildCspDirectives options,
// sourced from the Cloudflare Worker env binding AUTH0_ORIGIN.
// This constant is the dev-tenant fallback; CSP behavior is unchanged when no
// override is provided.
export const AUTH0_ORIGIN = "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com";

/**
 * Default CSP directive map — matches current production policy exactly.
 * Values that contain the nonce are intentionally left as functions of
 * the nonce parameter rather than stored in this map.
 */
function defaultDirectives(nonce, auth0Origin) {
  return {
    "default-src": "'self'",
    "script-src": `'nonce-${nonce}' 'self'`,
    "style-src": "'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src": "'self' data: https:",
    "font-src": "'self' https://fonts.gstatic.com",
    "connect-src": `'self' ${auth0Origin} https://api.mattbutlerengineering.com`,
    "frame-ancestors": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
  };
}

/**
 * Build the Content-Security-Policy header value.
 *
 * @param {string} nonce - Per-request cryptographic nonce (hex string).
 * @param {object} [options]
 * @param {string} [options.auth0Origin] - Auth0 tenant origin for connect-src.
 *   Defaults to AUTH0_ORIGIN from edge-router.js.
 * @param {Record<string, string>} [options.kvPolicy] - Directive overrides from
 *   KV ("security/csp"). Each key is a directive name; each value is the
 *   directive value (without the directive name prefix). Nonce-carrying
 *   directives in kvPolicy should already include the nonce token.
 * @returns {string} The assembled CSP header value.
 */
export function buildCspDirectives(nonce, options = {}) {
  const auth0Origin = options.auth0Origin ?? AUTH0_ORIGIN;
  const kvPolicy = options.kvPolicy ?? {};

  const defaults = defaultDirectives(nonce, auth0Origin);

  // Merge: KV overrides win over defaults, but ordering follows defaults.
  const merged = { ...defaults, ...kvPolicy };

  // Emit in insertion order of defaults (stable, predictable output).
  return Object.entries(merged)
    .map(([directive, value]) => `${directive} ${value}`)
    .join("; ");
}

/**
 * Inject nonce="<nonce>" into every <script ...> opening tag in an HTML string.
 *
 * This mirrors what NonceInjector does inside HTMLRewriter, but as a pure
 * string transform that works in plain Node — enabling unit tests without the
 * Worker runtime.
 *
 * The regex matches the literal opening `<script` token and inserts the nonce
 * attribute immediately after. It intentionally does NOT match HTML comments
 * (<!-- ... -->) because comments are not parsed as elements.
 *
 * @param {string} html - HTML source string.
 * @param {string} nonce - The CSP nonce value (no quotes).
 * @returns {string} HTML with nonce attributes added to all <script> tags.
 */
export function injectNonceIntoHtml(html, nonce) {
  if (!html) return html;
  return html.replace(/<script(?=[ >])/g, `<script nonce="${nonce}"`);
}
