/**
 * Health deps handler — serves the auto-generated dependency graph.
 *
 * Extracted from edge-router.js.
 */

import depGraph from "../dep-graph.json";

const ALLOWED_ORIGINS = new Set([
  "https://mattbutlerengineering.com",
  "https://hospitality.mattbutlerengineering.com",
  "https://gen.mattbutlerengineering.com",
]);

function corsOriginFor(request) {
  const origin = request.headers.get("Origin");
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}

/**
 * Handle GET /health/deps — return the auto-generated service dependency graph.
 */
function handleHealthDeps(request) {
  const corsOrigin = corsOriginFor(request);
  return new Response(JSON.stringify(depGraph), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      ...(corsOrigin ? { "Access-Control-Allow-Origin": corsOrigin } : {}),
    },
  });
}

export { handleHealthDeps };
