/**
 * Cloudflare Worker edge router for mattbutlerengineering.com
 *
 * Routes requests based on path prefix:
 *   /api/*                   → DO App Platform (HTTP subrequest)
 *   /canary/marketing/*      → Canary Workers Static Assets (Service Binding, CDN-free)
 *   /canary/hospitality/*    → Canary Workers Static Assets (Service Binding, CDN-free)
 *   /canary/rialto/*         → Canary Workers Static Assets (Service Binding, CDN-free)
 *   /gen/*                   → Workers Static Assets (Service Binding, CDN-free)
 *   /hospitality/*           → Workers Static Assets (Service Binding, CDN-free)
 *   /rialto/*                → Workers Static Assets (Service Binding, CDN-free)
 *   /*                       → Workers Static Assets (Service Binding, CDN-free)
 *
 * Static site Workers are called via Service Bindings (env.BINDING.fetch()),
 * which bypass the CDN entirely — eliminating stale HTML after deploys.
 *
 * Canary routes expose freshly-deployed canary Workers for pre-promotion
 * verification. They are stripped of the /canary/<app> prefix before
 * forwarding so the app Worker receives the same paths as production.
 */
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://dev-ytbgmz5ls3wh4xdx.us.auth0.com https://api.mattbutlerengineering.com https://cloudflareinsights.com",
    "frame-ancestors 'none'",
  ].join("; "),
};

/**
 * Determine the correct Cache-Control header based on the request path.
 *
 * Hashed assets (Vite outputs under /assets/ with content hashes) are
 * immutable by definition — cache them for one year.  HTML documents
 * must always revalidate so deploys take effect immediately.
 */
function cacheControlFor(pathname) {
  if (pathname.includes("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  // HTML and other types are handled in addHeaders where Content-Type is available
  return null;
}

/**
 * Clone a response, append security headers, and set cache headers.
 * Used for static site responses only (not API proxy).
 */
function addHeaders(response, pathname) {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  // Cache policy: hashed assets get immutable; HTML always revalidates
  const cacheOverride = cacheControlFor(pathname);
  if (cacheOverride) {
    headers.set("Cache-Control", cacheOverride);
  } else {
    const contentType = headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    }
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
      return addHeaders(
        Response.redirect(
          `https://${bare}${url.pathname}${url.search}`,
          301
        ),
        url.pathname
      );
    }

    // Redirect legacy /dashboard → /hospitality
    if (url.pathname.startsWith("/dashboard")) {
      const rest = url.pathname.slice("/dashboard".length);
      return addHeaders(
        Response.redirect(
          `https://${url.hostname}/hospitality${rest}`,
          301
        ),
        url.pathname
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
      return addHeaders(
        Response.redirect(
          `https://${url.hostname}${url.pathname}/${url.search}`,
          301
        ),
        url.pathname
      );
    }

    // ── Canary routes → Canary Workers (CDN-free) ───────────────────
    // /canary/<app>[/rest] → strips /canary/<app> and forwards to canary Worker.
    // Canary Workers are accessible only through this router, never directly.
    if (url.pathname.startsWith("/canary/")) {
      let canaryBinding;
      let canaryPrefix = "";

      if (url.pathname.startsWith("/canary/marketing")) {
        canaryBinding = env.MARKETING_CANARY;
        canaryPrefix = "/canary/marketing";
      } else if (url.pathname.startsWith("/canary/hospitality")) {
        canaryBinding = env.HOSPITALITY_CANARY;
        canaryPrefix = "/canary/hospitality";
      } else if (url.pathname.startsWith("/canary/rialto")) {
        canaryBinding = env.RIALTO_CANARY;
        canaryPrefix = "/canary/rialto";
      }

      if (canaryBinding) {
        const strippedCanaryPath = url.pathname.slice(canaryPrefix.length) || "/";
        const canaryUrl = new URL(strippedCanaryPath + url.search, url.origin);
        const canaryRequest = new Request(canaryUrl, request);
        const canaryResponse = await canaryBinding.fetch(canaryRequest);
        return addHeaders(canaryResponse, url.pathname);
      }

      // Unknown /canary/* path — 404
      return new Response("Not Found", { status: 404 });
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
          return addHeaders(
            new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: rewritten,
            }),
            url.pathname
          );
        }
      } catch {
        // Relative or malformed Location header — pass through as-is
      }
    }

    return addHeaders(response, url.pathname);
  },
};
