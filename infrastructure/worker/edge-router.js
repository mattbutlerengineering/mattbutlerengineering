/**
 * Cloudflare Worker edge router for mattbutlerengineering.com
 *
 * Routes requests based on path prefix:
 *   /api/*          → DO App Platform (API services)
 *   /hospitality/*  → CF Pages (hospitality project, prefix stripped)
 *   /rialto/*       → CF Pages (rialto-web project, prefix stripped)
 *   /*              → CF Pages (marketing project)
 */
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

    // Determine origin, path prefix to strip, and rewritten path
    let origin;
    let prefix = "";
    let path = url.pathname;

    if (path.startsWith("/api/") || path === "/api") {
      origin = env.API_ORIGIN;
    } else if (path.startsWith("/hospitality")) {
      origin = env.HOSPITALITY_ORIGIN;
      prefix = "/hospitality";
      path = path.slice(prefix.length) || "/";
    } else if (path.startsWith("/rialto")) {
      origin = env.RIALTO_ORIGIN;
      prefix = "/rialto";
      path = path.slice(prefix.length) || "/";
    } else {
      origin = env.MARKETING_ORIGIN;
    }

    // Proxy to origin
    const target = new URL(path + url.search, origin);
    const headers = new Headers(request.headers);
    headers.set("Host", target.host);
    headers.set("X-Forwarded-Host", url.host);

    const response = await fetch(
      new Request(target, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      })
    );

    // Rewrite Location headers so redirects use the public domain, not internal origins.
    // Re-adds the stripped prefix (e.g., /hospitality) so the client sees correct public URLs.
    const location = response.headers.get("Location");
    if (location) {
      try {
        const loc = new URL(location);
        if (loc.host !== url.host) {
          const rewritten = new Headers(response.headers);
          rewritten.set(
            "Location",
            `https://${url.host}${prefix}${loc.pathname}${loc.search}`
          );
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: rewritten,
          });
        }
      } catch {
        // Relative Location header — pass through as-is
      }
    }

    return response;
  },
};
