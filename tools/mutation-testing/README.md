# @mbe/mutation-testing

Isolated devDependency host for the repo's Stryker mutation-testing tooling. This package has no source code and nothing imports it — it exists so `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` live in their own pnpm workspace importer, separate from the root `devDependencies`.

## History: the `vitest` pin that used to live here

Until #5826, this package hardcoded `vitest@4.1.11` instead of the workspace catalog's `^5.0.1`, because `@stryker-mutator/vitest-runner@10.0.0`'s own `devDependencies` test against `vitest@4.1.10` and an earlier run against `vitest@5.x` had hit two apparent upstream bugs (every mutant misclassified `Survived` with `testsCompleted: 0`; a `VitestTestRunner.init()` crash under `--logLevel debug`) — see `mattbutlerengineering/mattbutlerengineering#5614`.

#5826 re-verified this against the current `@stryker-mutator/vitest-runner@10.0.0` + workspace `vitest@5.0.1`: both a scoped run (`services/users/src/routes/health.ts`) and the full configured `mutate` set scored cleanly (101 mutants, 100 killed / 1 survived, 99.01%, classified `scored` by `scripts/classify-mutation-run.mjs` — not `harness-broken`). Neither bug reproduced, so `vitest` here is now `"catalog:"` like every other package. If a future dependency bump reintroduces the `testsCompleted: 0` symptom, re-pin here and update this section with the version pair that broke.

## Usage

Not invoked directly. The root `pnpm test:mutations` script runs the Stryker CLI installed here (`tools/mutation-testing/node_modules/.bin/stryker run`) with the repo root as the working directory, so `stryker.config.mjs`'s `mutate` globs and `vitest.dir: "services/users"` still resolve against the repo root as before. Node's module resolution finds `@stryker-mutator/vitest-runner` (and its `vitest` peer) relative to where `@stryker-mutator/core` itself lives — this package's `node_modules` — regardless of the invoking CWD.
