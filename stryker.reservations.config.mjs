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
 * Not yet wired into .github/workflows/mutation-testing.yml: whether it runs
 * as a second step or its own scheduled job is an open decision on #9333.
 */
import usersConfig from "./stryker.config.mjs";

export default {
  ...usersConfig,

  mutate: [
    "services/reservations/src/services/*.ts",
    "!services/reservations/src/services/*.test.ts",
    "services/reservations/src/transitions/*.ts",
    "!services/reservations/src/transitions/*.test.ts",
  ],

  // Same exclusions as the users config, with the roles swapped: the
  // reservations tree must be in the sandbox, the users tree must not.
  ignorePatterns: [
    ...usersConfig.ignorePatterns.filter(
      (pattern) =>
        pattern !== "services/reservations/**" && pattern !== "services/users/node_modules/**"
    ),
    "services/users/**",
    "services/reservations/node_modules/**",
  ],

  vitest: {
    configFile: "services/reservations/vitest.config.ts",
    related: false,
    dir: "services/reservations",
  },

  jsonReporter: { fileName: "reports/mutation-reservations/mutation.json" },
  htmlReporter: { fileName: "reports/mutation-reservations/mutation.html" },
};
