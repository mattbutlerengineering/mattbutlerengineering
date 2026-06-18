/**
 * Response formatting utilities for the edge router.
 *
 * Owns:
 *  - Security headers (HSTS, CSP with per-request nonce, frame options, etc.)
 *  - Cache-control rules (hashed assets → immutable; HTML → must-revalidate)
 *  - HTML nonce injection via HTMLRewriter
 *  - Branded error page generation
 *  - KV CSP policy reader
 */

import { buildCspDirectives } from "./csp.js";
import topologyConfig from "./routes-config.json";

/**
 * Build security headers with a per-request nonce for CSP script-src.
 */
function buildSecurityHeaders(nonce, kvPolicy) {
  return {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "0",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Content-Security-Policy": buildCspDirectives(nonce, { kvPolicy }),
  };
}

/**
 * Read the CSP policy override from KV ("security/csp").
 * Returns null on miss or error — callers treat null as "use hardcoded fallback".
 */
async function readCspPolicy(kv) {
  try {
    return await kv.get("security/csp", "json");
  } catch {
    return null;
  }
}

/**
 * Determine the correct Cache-Control header based on the request path.
 * Returns null for non-asset paths (caller uses content-type to decide).
 */
function cacheControlFor(pathname) {
  const cls = topologyConfig.cacheClasses["static-site"];
  if (pathname.includes("/assets/")) {
    return cls.hashedAssets;
  }
  return null;
}

/**
 * Generate a cryptographically random nonce for CSP.
 */
function generateNonce() {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * HTMLRewriter element handler that adds a nonce attribute to <script> tags.
 */
class NonceInjector {
  constructor(nonce) {
    this.nonce = nonce;
  }

  element(el) {
    el.setAttribute("nonce", this.nonce);
  }
}

/**
 * Clone a response, append security headers, set cache headers,
 * and inject nonce into <script> tags for HTML responses.
 * Used for static site responses only (not API proxy).
 */
function addHeaders(response, pathname, nonce, kvPolicy) {
  const securityHeaders = buildSecurityHeaders(nonce, kvPolicy);
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(securityHeaders)) {
    headers.set(key, value);
  }

  const cacheOverride = cacheControlFor(pathname);
  if (cacheOverride) {
    headers.set("Cache-Control", cacheOverride);
  } else {
    const contentType = headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      headers.set("Cache-Control", topologyConfig.cacheClasses["static-site"].html);
    }
  }

  const contentType = headers.get("Content-Type") || "";
  if (contentType.includes("text/html")) {
    return new HTMLRewriter().on("script", new NonceInjector(nonce)).transform(
      new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Return a branded error page for service failures.
 */
function brandedErrorPage(statusCode, message, requestId, nonce = "", kvPolicy) {
  const statusMessages = {
    502: "Service temporarily unavailable",
    503: "Service temporarily unavailable",
    504: "Request timed out",
    default: "Service unreachable",
  };

  const displayMessage = statusMessages[statusCode] || statusMessages.default;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Service Unavailable - Matt Butler Engineering</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container {
      max-width: 500px;
      text-align: center;
    }
    .logo {
      font-size: 1.5rem;
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 2rem;
      letter-spacing: -0.025em;
    }
    h1 {
      font-size: 2rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: #f1f5f9;
    }
    p {
      font-size: 1.125rem;
      color: #94a3b8;
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }
    .error-code {
      font-size: 0.875rem;
      color: #64748b;
      font-family: monospace;
      background: #1e293b;
      padding: 0.25rem 0.75rem;
      border-radius: 0.25rem;
      display: inline-block;
      margin-bottom: 1.5rem;
    }
    .link {
      color: #38bdf8;
      text-decoration: none;
    }
    .link:hover {
      text-decoration: underline;
    }
    .refresh {
      font-size: 0.875rem;
      color: #64748b;
      margin-top: 2rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">Matt Butler Engineering</div>
    <h1>${displayMessage}</h1>
    <p>We're experiencing some technical difficulties. Please try again shortly.</p>
    <div class="error-code">Request ID: ${requestId}</div>
    <p><a href="/" class="link">Return to homepage</a></p>
    <p class="refresh">Refreshing automatically in 30 seconds...</p>
  </div>
  <script nonce="${nonce}">setTimeout(() => location.reload(), 30000);</script>
</body>
</html>`;

  const securityHeaders = nonce ? buildSecurityHeaders(nonce, kvPolicy) : {};
  return new Response(html, {
    status: statusCode,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
      ...securityHeaders,
    },
  });
}

export {
  buildSecurityHeaders,
  readCspPolicy,
  cacheControlFor,
  generateNonce,
  NonceInjector,
  addHeaders,
  brandedErrorPage,
};
