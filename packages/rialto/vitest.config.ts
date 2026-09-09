import { resolve } from "path";
import { defineVitestConfig } from "@mbe/config/vitest/react";

export default defineVitestConfig({
  include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
  coverage: {
    include: ["src/**/*.{ts,tsx}"],
    exclude: [
      "src/**/*.test.{ts,tsx}",
      "src/**/index.ts",
      "src/test/**",
      "src/**/*.stories.{ts,tsx}",
      "src/showcase/**",
    ],
    thresholds: {
      lines: 70,
      branches: 55,
      functions: 70,
      statements: 70,
    },
  },
  extend: {
    resolve: {
      alias: {
        // useChatStream.test.ts mocks this module (vi.mock) but Vite still
        // has to resolve the bare specifier before the mock intercepts it.
        // The package's exports map only points at dist/streaming.js, so
        // this test failed with "Failed to resolve import" whenever
        // @mbe/api-client hadn't been built first — a fragile, non-hermetic
        // dependency on a sibling package's build artifact for a unit test
        // that already fully mocks that collaborator. Aliasing straight to
        // source removes the cross-package build-order requirement.
        "@mbe/api-client/streaming": resolve(__dirname, "../api-client/src/streaming.ts"),
      },
    },
    css: {
      modules: {
        localsConvention: "camelCase",
      },
    },
    test: {
      setupFiles: ["./src/test/setup.ts"],
      environmentMatchGlobs: [["scripts/**/*.test.ts", "node"]],
      // 15s, not the 5s vitest default: slowest test measured warm is 3.405s
      // (scripts/all-artifacts.drift.test.ts, a full introspectComponents()
      // parse) — only 1.47x under the default. A pnpm-lock.yaml touch
      // cold-busts every turbo task and roughly doubles durations (the
      // mechanism that red main at #3588), putting it at ~6.8s — past the
      // default, which matches this package's observed flake under
      // full-parallel local runs. 15s clears the warm measurement 4.4x and
      // the cold-doubled estimate 2.2x, on the repo's established 15s tier
      // (gotchas.md; tools/cli and service route-test precedent).
      testTimeout: 15000,
      // `beforeAll`/`beforeEach` hooks run under a SEPARATE budget
      // (`hookTimeout`, vitest default 10s) that `testTimeout` above never
      // covers. generate-registry.test.ts/generate-manifest.test.ts now cache
      // a single introspectComponents() call (a full TS Compiler API
      // program+typecheck) in `beforeAll` instead of re-running it per-test —
      // but under CI's real turbo-parallel contention (~50 concurrent test
      // tasks), even one such call measured hitting the unconfigured 10s
      // hookTimeout wall (nightly-compliance #4701/#4780/#4877/#4947/#4997/
      // #5052 — the prior fix in #4956 bumped testTimeout only, missing this
      // separate budget entirely). 30s matches the generous per-test override
      // already used for the subprocess-based drift test below.
      hookTimeout: 30000,
      css: {
        modules: {
          classNameStrategy: "non-scoped",
        },
      },
    },
  },
});
