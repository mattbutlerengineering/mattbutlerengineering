/**
 * Shared reporter for "fitness-check" scripts (scripts/check-*.mjs|.js).
 *
 * Each check produces a pure `findings` array (its own domain-specific
 * logic); this module owns the one PASS/FAIL reporting protocol so no
 * individual check has to hand-roll console.log formatting + exit codes.
 *
 * `runCheck` itself never calls `process.exit` — it only returns the exit
 * code — so it stays unit-testable without forking a subprocess. Callers
 * do `process.exit(runCheck({ ... }))` at their CLI entry point.
 */

/**
 * @template T
 * @param {object} opts
 * @param {string} opts.name - human label for the check, used in default messages
 * @param {T[]} opts.findings - violations found; empty array means PASS
 * @param {(finding: T) => string} [opts.formatFinding] - render one finding as a line;
 *   when omitted, individual findings are not printed (the caller already logged detail)
 * @param {string} [opts.passMessage] - override the default "PASS: <name>" message
 * @param {string} [opts.failMessage] - override the default "FAIL: <name> — N issue(s) found:" message
 * @returns {number} 0 when findings is empty, 1 otherwise
 */
export function runCheck({ name, findings, formatFinding, passMessage, failMessage }) {
  if (findings.length === 0) {
    console.log(passMessage ?? `PASS: ${name}`);
    return 0;
  }

  console.log(failMessage ?? `FAIL: ${name} — ${findings.length} issue(s) found:`);
  if (formatFinding) {
    for (const finding of findings) {
      console.log(`  ${formatFinding(finding)}`);
    }
  }
  return 1;
}
