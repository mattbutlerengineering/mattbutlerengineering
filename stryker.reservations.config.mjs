/**
 * Stryker Mutation Testing Configuration — services/reservations (#9333)
 *
 * Second scope of the mutation pilot, next to the services/users config in
 * stryker.config.mjs. The booking/deposit state machine lives here, and it had
 * never had a mutant generated against it.
 *
 * Reuses the users pilot's runner, plugin, mutator exclusions, thresholds and
 * timeouts (spread from stryker.config.mjs), so the silent-zero-tests failure
 * mode documented there is guarded by the same scripts/classify-mutation-run.mjs.
 * Only the scope differs: mutate globs, sandbox ignores, the vitest config, and
 * the report location (separate from reports/mutation/ so the two runs do not
 * overwrite each other).
 *
 * Run: tools/mutation-testing/node_modules/.bin/stryker run stryker.reservations.config.mjs
 * Wired into .github/workflows/mutation-testing.yml as a second step of the
 * same job (#9597), which shares the Prisma client cache restored there. The
 * step is continue-on-error and reports to its own artifact and summary, so a
 * reservations failure never changes the services/users result.
 */
import usersConfig from "./stryker.config.mjs";

export default {
  ...usersConfig,

  mutate: [
    // Narrowed to the transition logic and the deposit services so one run
    // fits the workflow's 30-minute window (#9616).
    "services/reservations/src/services/deposit.ts",
    "services/reservations/src/services/deposit-state-machine.ts",
    "services/reservations/src/transitions/*.ts",
    "!services/reservations/src/transitions/*.test.ts",
  ],

  // Same exclusions as the users config, with the roles swapped: the
  // reservations tree must be in the sandbox, the users tree must not.
  ignorePatterns: [
    ...usersConfig.ignorePatterns.filter(
      (pattern) =>
        pattern !== "services/reservations/**" &&
        pattern !== "services/users/node_modules/**" &&
        // The reservations tests import the generated Prisma client, which the
        // sandbox must therefore carry (the workflow restores it before the run).
        pattern !== "**/generated/**"
    ),
    "services/users/**",
    "services/reservations/node_modules/**",
  ],

  vitest: {
    // Narrowed config: only the tests for the mutated files (#9616).
    configFile: "services/reservations/vitest.stryker.config.ts",
    related: false,
    dir: "services/reservations",
  },

  jsonReporter: { fileName: "reports/mutation-reservations/mutation.json" },
  htmlReporter: { fileName: "reports/mutation-reservations/mutation.html" },
};
