# @mbe/mutation-testing

Isolated devDependency host for the repo's Stryker mutation-testing tooling. This package has no source code and nothing imports it — its sole purpose is to pin a `vitest` version for `@stryker-mutator/vitest-runner` that differs from the workspace's `vitest` catalog version, without affecting any other package's test runner.

## Why this package exists

`@stryker-mutator/vitest-runner@10.0.0` (latest, as of writing) is only tested against `vitest@4.1.10` (see its own `devDependencies`) — its peer range (`vitest: ">=2.0.0"`) is misleadingly permissive. Running it against `vitest@5.x` (this workspace's catalog version, `pnpm-workspace.yaml`) hits two confirmed, still-open upstream bugs:

- Every mutant run reports `testsCompleted: 0` and is misclassified `Survived` (regardless of the mutation actually being caught) — [stryker-js#6213](https://github.com/stryker-mutator/stryker-js/issues/6213).
- With `--logLevel debug`, `VitestTestRunner.init()` crashes serializing vitest's resolved config (`TypeError: Converting circular structure to JSON`) before a single mutant runs.

Both surface as `mutation-testing.yml`'s scheduled run reporting a **0% score with a report that "succeeded"** — an infra failure, not a real quality regression (see the issue that prompted this fix).

pnpm resolves a peer dependency from the _same importer's_ already-resolved version whenever it's compatible, so neither `pnpm.overrides` (doesn't retarget peer edges) nor `pnpm.packageExtensions` (can't override an _already-declared_ dependency/peerDependency key, only add new ones) can give `@stryker-mutator/vitest-runner` a different `vitest` while it lives alongside the workspace root's own `vitest` devDependency. The only mechanism that actually works is a separate pnpm workspace importer — this package — with its own non-catalog `vitest` pin, so `@stryker-mutator/vitest-runner`'s peer resolves independently of every other package's `vitest@5.x`.

## Usage

Not invoked directly. The root `pnpm test:mutations` script runs the Stryker CLI installed here (`tools/mutation-testing/node_modules/.bin/stryker run`) with the repo root as the working directory, so `stryker.config.mjs`'s `mutate` globs and `vitest.dir: "services/users"` still resolve against the repo root as before. Node's module resolution finds `@stryker-mutator/vitest-runner` (and the `vitest@4.1.10` it actually uses) relative to where `@stryker-mutator/core` itself lives — this package's `node_modules` — regardless of the invoking CWD.

Upgrade path: once a `@stryker-mutator/vitest-runner` release supports `vitest@5.x` (see the linked upstream issue for status), bump `vitest` here to match the workspace catalog and this package can likely be collapsed back into the root `devDependencies`.
