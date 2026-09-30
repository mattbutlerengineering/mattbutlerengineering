/**
 * findings-ledger.mjs — the pure write side of `findings.mjs`: `record`,
 * `migrate` and `seeds` (docs/features/ui-quality-loop/architecture.md
 * § Interfaces `findings.mjs plan | record | migrate | seeds`).
 *
 * Every function returns a new ledger; none mutates its input.
 */

import { findingKey, parseKey } from "./findings-plan.mjs";
import { tellsById } from "./rubric.mjs";

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function nextRecord(prev, { issue, carrier, severity, legacy, state = "open" }, today) {
  const legacyNumber = legacy ?? prev?.legacy;
  return {
    issue,
    carrier,
    state,
    severity: severity ?? prev?.severity,
    first_seen: prev?.first_seen ?? today,
    last_seen: today,
    ...(legacyNumber === undefined ? {} : { legacy: legacyNumber }),
    escalated_at: prev?.escalated_at ?? null,
  };
}

/**
 * Write an executed plan back: issue numbers, carriers, last_seen.
 * Throws (nothing written) when a create or reopen carries no issue number —
 * the routine's execution was partial and recording it would lose the link.
 * `escalated` (issue numbers `p1-age.mjs --escalate` actions were executed
 * for) stamps `escalated_at` on every record carried by that issue, once.
 *
 * @param {Record<string, object>} ledger
 * @param {{ actions: object[], seeds?: object[], fix_pr?: { key: string, pr: number }, escalated?: number[] }} executed
 * @param {string} now ISO timestamp; its date is last_seen
 */
export function applyExecuted(ledger, executed, now) {
  const today = now.slice(0, 10);
  const escalatedAt = now;
  const unnumbered = executed.actions
    .filter((a) => a.carrier !== "seed" && !Number.isInteger(a.issue))
    .map((a) => a.key);
  if (unnumbered.length > 0) {
    throw new Error(`no issue number for ${unnumbered.join(", ")} — was every create executed?`);
  }
  const updates = executed.actions.flatMap((a) => {
    if (a.carrier === "seed") {
      return [[a.key, { issue: null, carrier: "seed", severity: a.severity }]];
    }
    if (a.carrier === "aggregate") {
      return [
        [a.key, { issue: a.issue, carrier: "issue", severity: a.severity }],
        ...a.members.map((m) => [
          m,
          { issue: a.issue, carrier: `aggregate:${a.issue}`, severity: a.severity },
        ]),
      ];
    }
    const prevCarrier = ledger[a.key]?.carrier ?? "";
    const carrier = prevCarrier.startsWith("fix-pr:") ? prevCarrier : "issue";
    return [[a.key, { issue: a.issue, carrier, severity: a.severity, legacy: a.legacy }]];
  });
  const seedUpdates = (executed.seeds ?? []).map((s) => [
    s.key,
    { issue: null, carrier: "seed", severity: s.severity },
  ]);
  const escalated = new Set(executed.escalated ?? []);
  const fix = executed.fix_pr;
  const withFix = (key, update) =>
    fix && fix.key === key ? { ...update, carrier: `fix-pr:${fix.pr}` } : update;
  const recorded = {
    ...ledger,
    ...Object.fromEntries(
      [...updates, ...seedUpdates].map(([key, update]) => [
        key,
        nextRecord(ledger[key], withFix(key, update), today),
      ])
    ),
  };
  return Object.fromEntries(
    Object.entries(recorded).map(([key, rec]) => [
      key,
      escalated.has(rec.issue) && !rec.escalated_at ? { ...rec, escalated_at: escalatedAt } : rec,
    ])
  );
}

/**
 * Re-key every open finding at `from` whose tell survives in the rubric to
 * `to`, same issue number; list open findings whose tell was retired.
 * @returns {{ ledger: Record<string, object>, rekeyed: object[], retired: object[] }}
 */
export function migrateLedger(ledger, from, to, rubric) {
  if (to !== rubric.rubric_version) {
    throw new Error(
      `--to ${to} is not the rubric's current version (rubric v${rubric.rubric_version})`
    );
  }
  if (!(from < to)) throw new Error(`--from ${from} must be below --to ${to}`);
  const tells = tellsById(rubric);
  const open = Object.keys(ledger)
    .filter((key) => parseKey(key)?.version === from && ledger[key].state === "open")
    .sort(byString);
  const surviving = open.filter((key) => tells.has(parseKey(key).tell));
  const rekeyed = surviving.map((key) => ({
    from: key,
    to: findingKey(parseKey(key), to),
    issue: ledger[key].issue,
  }));
  const clash = rekeyed.filter((r) => ledger[r.to] !== undefined).map((r) => r.to);
  if (clash.length > 0) throw new Error(`target key(s) already ledgered: ${clash.join(", ")}`);
  const moved = new Set(surviving);
  return {
    ledger: Object.fromEntries([
      ...Object.entries(ledger).filter(([key]) => !moved.has(key)),
      ...rekeyed.map((r) => [r.to, ledger[r.from]]),
    ]),
    rekeyed,
    retired: open
      .filter((key) => !moved.has(key))
      .map((key) => ({ key, issue: ledger[key].issue })),
  };
}

/**
 * Backlog lines for a plan's seeds, in the protocol form, skipping any seed
 * whose title an existing line already carries.
 * @returns {string[]}
 */
export function renderSeeds(seeds, existingLines, date) {
  return seeds
    .filter((s) => !existingLines.some((l) => l.includes(s.title)))
    .map((s) => `- ${s.title} (from: session:${date})`);
}
