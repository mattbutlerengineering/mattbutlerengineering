/**
 * Architecture fitness rules for the file-level import graph.
 * Complements scripts/check-circular-deps.js (package.json-level) with
 * source-level cycle and layer-boundary enforcement.
 *
 * Run: pnpm check:boundaries
 */

/** Source files allowed to depend on devDependencies / other test code. */
const TEST_PATHS = [
  "\\.test\\.[cm]?[jt]sx?$",
  "\\.spec\\.[cm]?[jt]sx?$",
  "\\.stories\\.[cm]?[jt]sx?$",
  "(^|/)__tests__/",
  "(^|/)__mocks__/",
  "(^|/)test/",
  "(^|/)tests/",
  "(^|/)e2e/",
  "(^|/)vitest\\.",
  "(^|/)playwright\\.",
  "(^|/)vite\\.config\\.",
];

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular imports cause init-order bugs and block refactors.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-cross-service",
      severity: "error",
      comment:
        "Services are independently deployable — share code via packages/*, never import a sibling service.",
      from: { path: "^services/([^/]+)/" },
      to: { path: "^services/", pathNot: "^services/$1/" },
    },
    {
      name: "packages-no-upward",
      severity: "error",
      comment: "Shared packages must not depend on apps or services (layer inversion).",
      from: { path: "^packages/" },
      to: { path: "^(apps|services)/" },
    },
    {
      name: "apps-not-imported",
      severity: "error",
      comment: "Apps are leaf deployables — nothing outside an app may import from it.",
      from: { pathNot: "^apps/([^/]+)/" },
      to: { path: "^apps/" },
    },
    {
      name: "rialto-stays-pure",
      severity: "error",
      comment:
        "Rialto is a browser UI library — no server-side packages or services.",
      from: { path: "^packages/rialto/" },
      to: { path: "^(services/|packages/(database|service-bootstrap|jobs)/)" },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      comment:
        "Production source may not import devDependencies — breaks at deploy time when devDeps are pruned.",
      from: { path: "^(apps|services|packages|tools)/", pathNot: TEST_PATHS },
      to: {
        dependencyTypes: ["npm-dev"],
        dependencyTypesNot: ["type-only"],
        pathNot: ["node_modules/@types/"],
      },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment: "Module no one imports — dead code or a missing wire-up.",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "(^|/)index\\.[cm]?[jt]sx?$",
          "(^|/)(vitest|vite|playwright|eslint|prettier|tsup|rollup|tailwind|postcss)[^/]*\\.config\\.",
          "(^|/)prisma/seed\\.ts$",
          "(^|/)setupTests\\.[jt]s$",
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$",
          "(^|/)scripts/",
          ...TEST_PATHS,
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: [
        "(^|/)dist/",
        "(^|/)build/",
        "(^|/)coverage/",
        "(^|/)storybook-static/",
        "(^|/)\\.storybook/",
        "(^|/)playwright-report/",
        "(^|/)test-results/",
        "(^|/)node_modules/",
        "src/generated/",
        "\\.d\\.ts$",
      ],
    },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "require", "default"],
      mainFields: ["module", "main", "types"],
    },
    cache: { folder: "node_modules/.cache/dependency-cruiser" },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
