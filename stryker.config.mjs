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
  //
  // This runner has a silent failure mode worth knowing about before you touch
  // it, because it produces a confident wrong number rather than an error.
  // 2026-09-21: the vitest 5 migration (#5590) landed at 14:33Z and the
  // scheduled run 82 minutes later (35622179696) reported 101/101 mutants
  // Survived, 0 Killed, `testsCompleted: 0` on every one — after five
  // consecutive green weekly runs. The plugin's peer range is
  // `vitest: ">=2.0.0"`, so pnpm installed it against a vitest it does not
  // support without complaint. The dry run still reported 138 tests; the
  // per-mutant runs ran none, and Stryker grades "no test failed" as Survived,
  // so the report came out a clean, plausible 0%. Verified by hand that the
  // "survivors" were trivially killable: applying mutant 0 (health.ts
  // BlockStatement -> `{}`) to the source fails 5/5 health tests. See #5614
  // for the full diagnosis and #5643 for the harness repair.
  //
  // The lesson that outlives any particular fix: a mutation score is only
  // meaningful if tests actually ran, and nothing about this config can tell
  // you whether they did. `scripts/classify-mutation-run.mjs` is the guard —
  // it reads `testsCompleted` and reports `harness-broken` instead of a score
  // whenever the run graded mutants without executing a single test. If you
  // change the runner, the sandbox layout, or the vitest major, that guard is
  // what will tell you it stopped measuring.
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

  // Baseline: 98.89% mutation score (89 killed / 90 tested, 1 survived) as
  // of 2026-08-02, run locally against this exact config — see
  // mattbutlerengineering/mattbutlerengineering#3628 and the PR that added
  // this comment for the validating workflow_dispatch run. Note a baseline is
  // only a claim about a working harness — see the `testRunner` note above for
  // the 2026-09-21 run that reported 0% without executing a test. The 80%
  // `high` threshold below is comfortably met by that baseline (this workflow's
  // long red streak was a `.metrics.mutationScore` parsing bug in
  // .github/workflows/mutation-testing.yml, not a real quality gap — see
  // scripts/collect-mutation-score.mjs). Set explicitly (rather than left to
  // Stryker's own default) so the number is visible without knowing
  // Stryker's defaults. Ratchet up deliberately as coverage improves; don't
  // lower without recording a new baseline run here.
  thresholds: { high: 80, low: 60, break: null },

  // Timeouts — the services/users test suite baseline is ~5.7s net (12s wall).
  // timeoutMS is the MINIMUM timeout added to the baseline; timeoutFactor
  // multiplies the baseline. We set a generous minimum (60s) so schema-mutation
  // test runs that take slightly longer than the baseline are not mis-classified
  // as Timeout. Genuine infinite loops will still be caught by the absolute cap.
  timeoutMS: 60000,
  timeoutFactor: 2,
};
