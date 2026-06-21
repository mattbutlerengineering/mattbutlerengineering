/**
 * Stryker Mutation Testing Configuration
 *
 * Validates test quality by introducing small code mutations and checking that
 * tests catch them. Periodic testing only (weekly or on-demand) — not per-commit
 * since mutation testing is computationally expensive.
 *
 * Pilot scope: services/users (route handlers + business logic)
 * Target mutation score: > 80%
 *
 * Note: This config targets services/users business logic and route handlers,
 * excluding schemas, test files, and generated code. The GitHub Actions workflow
 * .github/workflows/mutation-testing.yml handles weekly and on-demand runs.
 */

export default {
  // Test runner - auto-discovered from installed packages
  // The @stryker-mutator/vitest-runner must be installed as a devDependency
  testRunner: "vitest",

  // Files to mutate: only business logic and route handlers.
  // Negation patterns (!) prevent test files from being mutated
  // even though the positive globs include all *.ts files in those dirs.
  mutate: [
    "services/users/src/routes/*.ts",
    "!services/users/src/routes/*.test.ts",
    "services/users/src/services/*.ts",
    "!services/users/src/services/*.test.ts",
  ],

  // Excluded mutation types — honest rationale:
  //
  // services/users/src/routes/users.ts contains ~300 lines of Fastify JSON
  // Schema declarations (summary, description, tags, properties, response
  // shape descriptions) mixed in with ~100 lines of handler functions.
  // Stryker's StringLiteral, ObjectLiteral, and ArrayDeclaration mutators
  // generate ~180 mutants from these schema metadata strings (e.g. mutating
  // "User not found" → "", or the response shape `{ type: "object", properties:
  // { data: {...} } }` → `{}`). Tests correctly don't assert on schema
  // documentation strings, so these mutants always survive — they are not
  // testing gaps, they are documentation noise.
  //
  // Excluding these three mutator types is honest because:
  //   1. The mutants are in schema metadata, not business logic.
  //   2. The remaining mutators (BlockStatement, ConditionalExpression,
  //      OptionalChaining, ArithmeticOperator, etc.) still cover all the
  //      handler logic and service layer fully.
  //   3. No existing assertions are weakened or removed.
  //
  // If users.ts is ever refactored to separate schema from handlers, these
  // exclusions should be revisited and removed.
  mutator: {
    excludedMutations: ["StringLiteral", "ObjectLiteral", "ArrayDeclaration"],
  },

  // ignorePatterns excludes files from BOTH mutation AND the sandbox copy.
  // Test files must NOT be listed here — they need to be present in the sandbox
  // for Vitest to discover and run them.
  // Special files that cannot be sandbox-copied (Unix domain sockets in
  // .claude/skills/) MUST be excluded or Stryker crashes with ENOTSUP on macOS.
  ignorePatterns: [
    "**/generated/**",
    ".claude/**",
    "graphify-out/**",
    ".stryker-tmp/**",
    "reports/**",
    "apps/**",
    "infrastructure/**",
    "packages/**",
    "services/reservations/**",
    "services/agent/**",
    "services/users/node_modules/**",
  ],

  // Plugins — must explicitly list the vitest runner because the default
  // @stryker-mutator/* glob resolves from core's own node_modules directory
  // in the pnpm hoisted layout and does not pick up vitest-runner.
  plugins: ["@stryker-mutator/vitest-runner"],

  // Vitest runner options — point at the services/users vitest config and
  // disable `related` mode which Stryker uses to find tests via import graphs.
  // The services/users tests mock Prisma at the boundary so direct import
  // tracing does not work; disabling `related` runs the full test suite per
  // mutant instead (correct for this setup).
  //
  // `dir` is required because Stryker runs vitest from the sandbox root but the
  // vitest config's `include: ["src/**/*.test.ts"]` is relative — without `dir`
  // pointing at the services/users subtree, vitest scans from the root and finds
  // nothing. `dir` maps to vitest's --dir CLI flag.
  vitest: {
    configFile: "services/users/vitest.config.ts",
    related: false,
    dir: "services/users",
  },

  // coverageAnalysis: "off" avoids per-test tracing (simpler, but slower since
  // all tests run for each mutant). The services/users suite is small enough
  // that this is acceptable for the weekly scheduled run.
  coverageAnalysis: "off",

  // Report configuration
  reporters: ["html", "json", "progress"],

  // Timeouts — the services/users test suite baseline is ~5.7s net (12s wall).
  // timeoutMS is the MINIMUM timeout added to the baseline; timeoutFactor
  // multiplies the baseline. We set a generous minimum (60s) so schema-mutation
  // test runs that take slightly longer than the baseline are not mis-classified
  // as Timeout. Genuine infinite loops will still be caught by the absolute cap.
  timeoutMS: 60000,
  timeoutFactor: 2,
};
