import react from "@vitejs/plugin-react";
import { configDefaults } from "vitest/config";
import { buildVitestPreset } from "#vitest-base";

/**
 * React vitest preset: jsdom environment (overridable) + @vitejs/plugin-react.
 *
 * With `domInclude`, only those files pay for jsdom and the setup files; see `splitByDom`.
 *
 * @param {import("./react.js").ReactVitestPresetOptions} options
 * @returns {import("vitest/config").ViteUserConfig}
 */
export function defineVitestConfig({ domInclude, ...options }) {
  const config = buildVitestPreset({ environment: "jsdom", ...options }, { plugins: [react()] });
  return domInclude ? splitByDom(config, domInclude) : config;
}

/**
 * Splits one config into two vitest projects: "dom" (the `domInclude` globs, with the
 * configured environment and setupFiles) and "node" (every other included file, node
 * environment, no setupFiles). jsdom plus a setup file is paid once per test file, so a
 * file that never touches the DOM should not pay it (#10158).
 *
 * The default falls to node on purpose: a new file that needs the DOM and is not in
 * `domInclude` fails at once with "document is not defined", where a jsdom default would
 * only make it slow, silently. Vitest 5 has no `environmentMatchGlobs`, and an inline
 * project that extends the root (the default) concatenates `include` and `setupFiles`,
 * so each project is given the whole config with `extends: false`; coverage and
 * reporters are read from the root only.
 */
function splitByDom(config, domInclude) {
  const { test, ...vite } = config;
  const { coverage, reporters, outputFile, include, setupFiles, environment, ...shared } = test;
  const dom = { ...shared, name: "dom", environment, setupFiles, include: domInclude };
  const node = {
    ...shared,
    name: "node",
    environment: "node",
    ...(include ? { include } : {}),
    exclude: [...configDefaults.exclude, ...domInclude],
  };
  return {
    ...vite,
    test: {
      coverage,
      reporters,
      outputFile,
      projects: [
        { ...vite, extends: false, test: dom },
        { ...vite, extends: false, test: node },
      ],
    },
  };
}
