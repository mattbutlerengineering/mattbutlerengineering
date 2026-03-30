/**
 * Cloudflare Worker edge router for mattbutlerengineering.com
 *
 * Routes requests based on path prefix:
 *   /api/*          → DO App Platform (HTTP subrequest)
 *   /gen/*          → Workers Static Assets (Service Binding, CDN-free)
 *   /hospitality/*  → Workers Static Assets (Service Binding, CDN-free)
 *   /rialto/*       → Workers Static Assets (Service Binding, CDN-free)
 *   /*              → Workers Static Assets (Service Binding, CDN-free)
 *
 * Static site Workers are called via Service Bindings (env.BINDING.fetch()),
 * which bypass the CDN entirely — eliminating stale HTML after deploys.
 */
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://dev-ytbgmz5ls3wh4xdx.us.auth0.com https://api.mattbutlerengineering.com",
    "frame-ancestors 'none'",
  ].join("; "),
};

/**
 * Clone a response and append security headers.
 * Used for static site responses only (not API proxy).
 */
function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Redirect www → non-www
    if (url.hostname.startsWith("www.")) {
      const bare = url.hostname.slice(4);
      return Response.redirect(
        `https://${bare}${url.pathname}${url.search}`,
        301
      );
    }

    // Redirect legacy /dashboard → /hospitality
    if (url.pathname.startsWith("/dashboard")) {
      const rest = url.pathname.slice("/dashboard".length);
      return Response.redirect(
        `https://${url.hostname}/hospitality${rest}`,
        301
      );
    }

    // ── API routes → HTTP subrequest to DO App Platform ──────────────
    if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
      const target = new URL(url.pathname + url.search, env.API_ORIGIN);
      const headers = new Headers(request.headers);
      headers.set("Host", target.host);
      headers.set("X-Forwarded-Host", url.host);

      return fetch(
        new Request(target, {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
        })
      );
    }

    // ── Trailing-slash redirects for SPA prefixes ────────────────────
    // Without the trailing slash, the prefix strip leaves "" which
    // normalizes to "/" and causes React Router catch-all confusion.
    if (url.pathname === "/rialto" || url.pathname === "/hospitality" || url.pathname === "/gen") {
      return Response.redirect(
        `https://${url.hostname}${url.pathname}/${url.search}`,
        301
      );
    }

    // ── Static sites → Service Binding (CDN-free) ───────────────────
    let binding;
    let prefix = "";

    if (url.pathname.startsWith("/hospitality")) {
      binding = env.HOSPITALITY;
      prefix = "/hospitality";
    } else if (url.pathname.startsWith("/rialto")) {
      binding = env.RIALTO;
      prefix = "/rialto";
    } else if (url.pathname.startsWith("/gen")) {
      binding = env.GEN;
      prefix = "/gen";
    } else {
      binding = env.MARKETING;
    }

    // Strip path prefix before forwarding to the app Worker.
    // Each app is built with base: "/<name>/" in Vite, but the Worker
    // serves from root — so /hospitality/foo → /foo on the app Worker.
    const strippedPath = prefix ? (url.pathname.slice(prefix.length) || "/") : url.pathname;
    const appUrl = new URL(strippedPath + url.search, url.origin);
    const appRequest = new Request(appUrl, request);

    const response = await binding.fetch(appRequest);

    // Rewrite Location headers so redirects use the public domain with prefix.
    const location = response.headers.get("Location");
    if (location) {
      try {
        const loc = new URL(location, url.origin);
        if (loc.pathname !== url.pathname) {
          const rewritten = new Headers(response.headers);
          rewritten.set(
            "Location",
            `https://${url.host}${prefix}${loc.pathname}${loc.search}`
          );
          return addSecurityHeaders(
            new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: rewritten,
            })
          );
        }
      } catch {
        // Relative or malformed Location header — pass through as-is
      }
    }

    return addSecurityHeaders(response);
  },
};
