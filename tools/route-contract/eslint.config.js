import baseConfig from "@mbe/config/eslint/base";

// The `base` preset, deliberately, not `node`: @mbe/config/eslint/node bans
// importing @mbe/api-client outright ("Frontend-only package. Cannot import in
// backend services.", node.js:28-31). This package's whole job is to drive that
// client, and it is neither a backend service nor deployed anywhere — it only
// runs under vitest in CI. tools/cli/eslint.config.js solves the same collision
// by disabling the rule on top of `node`; `base` is the narrower answer here
// because nothing in this package is service code.
export default baseConfig;
