/**
 * scripts/load-test-scenario.mjs
 *
 * Pure scenario-selection logic for `.github/workflows/load-test.js`.
 *
 * k6 has no CLI flag to select a single scenario out of `options.scenarios`
 * — `--tag` only labels emitted metrics, it doesn't filter which scenarios
 * execute (see #3682: a `workflow_dispatch` requesting `smoke` still ran
 * smoke+load+stress concurrently). k6's own docs recommend filtering
 * `options.scenarios` in-script via an environment variable instead:
 * https://grafana.com/docs/k6/latest/using-k6/scenarios/advanced-examples/#run-specific-scenario-via-environment-variable
 *
 * Extracted into its own module (rather than inlined in load-test.js) so
 * it's unit-testable under vitest — k6 scripts import `k6/http` etc.,
 * which don't resolve under Node, but this module has no k6-runtime
 * dependency, and k6's local-module loader can import a plain relative
 * ES module like this one just as well.
 */

/**
 * @param {Record<string, unknown>} allScenarios
 * @param {string | undefined} requested
 * @returns {Record<string, unknown>}
 */
export function selectScenarios(allScenarios, requested) {
  if (!requested || !(requested in allScenarios)) {
    return allScenarios;
  }
  return { [requested]: allScenarios[requested] };
}
