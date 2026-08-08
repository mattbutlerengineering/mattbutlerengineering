import baseConfig from "@mbe/config/eslint/base";

// Cloudflare Workers runtime globals — Web-standard fetch/Request/Response/URL/
// crypto APIs plus the Workers-specific HTMLRewriter. ESLint's `no-undef` has
// no built-in knowledge of the Workers runtime (it isn't a browser or Node
// environment), so each one needs an explicit declaration here.
const WORKER_GLOBALS = {
  AbortSignal: "readonly",
  console: "readonly",
  crypto: "readonly",
  fetch: "readonly",
  Headers: "readonly",
  HTMLRewriter: "readonly",
  ReadableStream: "readonly",
  Request: "readonly",
  Response: "readonly",
  TextDecoder: "readonly",
  TextEncoder: "readonly",
  URL: "readonly",
};

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: WORKER_GLOBALS,
    },
  },
];
