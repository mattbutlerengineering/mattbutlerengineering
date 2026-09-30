/**
 * findings-plan.mjs — the pure core of `findings.mjs plan`
 * (docs/features/ui-quality-loop/architecture.md § Components "Findings").
 *
 * Every finding (and every P1 burst aggregate) goes through the shared
 * `fileIssue()` — this module never restates skip/create/reopen. It adds the
 * carrier rules on top: every P1 → issue; more than P1_BURST_AGGREGATE_AT P1s
 * on one (app, tell) → one aggregate issue; P2 → issue while
 * MAX_P2_ISSUES_PER_FIRE new issues last, then seed; at most one non-visual,
 * single-file finding marked the fix-PR candidate; agent-built findings drop
 * unless calibration passed.
 */

import { fileIssue } from "../lib/issue-filing.mjs";
import {
  FIX_PR_EXCLUDED_PREFIXES,
  FIX_PR_TELLS,
  MAX_P2_ISSUES_PER_FIRE,
  P1_BURST_AGGREGATE_AT,
  RUBRIC_URL,
} from "./config.mjs";
import { LABEL } from "./labels.mjs";
import { tellsById } from "./rubric.mjs";

export const CALIBRATION_STATUSES = ["pass", "failed", "stale"];
/** The route token of a P1 burst aggregate's key — never a router template. */
export const AGGREGATE_ROUTE = "(multiple)";

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** @returns {string} `<app>|<route>|r<version>|<tell-id>` */
export function findingKey(finding, version) {
  return `${finding.app}|${finding.route}|r${version}|${finding.tell}`;
}

/** @returns {{ app: string, route: string, version: number, tell: string } | null} */
export function parseKey(key) {
  const parts = key.split("|");
  const version = /^r(\d+)$/.exec(parts[2] ?? "");
  if (parts.length !== 4 || !version) return null;
  return { app: parts[0], route: parts[1], version: Number(version[1]), tell: parts[3] };
}

/** Open ledgered keys below the rubric's version whose tell the rubric still has. */
export function unmigratedKeys(ledger, rubric) {
  const tells = tellsById(rubric);
  return Object.keys(ledger)
    .filter((key) => {
      const k = parseKey(key);
      return (
        k !== null &&
        ledger[key].state === "open" &&
        k.version < rubric.rubric_version &&
        tells.has(k.tell)
      );
    })
    .sort(byString);
}

/**
 * The labelled issue numbers the findings ledger does not reference — as a
 * record's `issue` or an `aggregate:<n>` carrier. Non-empty means this fire
 * read incomplete state (a lost `ui-quality/ledger` branch, a push that failed
 * after filing), and planning against it would refile.
 *
 * @param {Record<string, object>} ledger
 * @param {number[]} labelled   every `ui-quality`-labelled issue number, any state
 * @returns {number[]} sorted ascending, deduplicated
 */
export function unknownLabelledIssues(ledger, labelled) {
  const known = new Set();
  for (const rec of Object.values(ledger)) {
    if (Number.isInteger(rec.issue)) known.add(rec.issue);
    const aggregate = /^aggregate:(\d+)$/.exec(String(rec.carrier ?? ""));
    if (aggregate) known.add(Number(aggregate[1]));
  }
  return [...new Set(labelled)].filter((n) => !known.has(n)).sort((a, b) => a - b);
}

/** The one issue a blocked fire opens, de-duplicated by this exact title. */
export const ESCALATION_TITLE = "ui-quality: filing blocked by unknown labelled issues";
const ESCALATION_LABELS = [LABEL.base, "needs-review"];

const FINDING_TITLE = /^ui-quality: (\S+) (\S+) — (\S+) \(rubric v(\d+)\)$/;
const AGGREGATE_TITLE = /^ui-quality: (\S+) — (\S+) on multiple routes \(rubric v(\d+)\)$/;

/**
 * The finding key an issue title names — the inverse of `titleFor` /
 * `aggregateTitle` — or null unless the title is at the rubric's current
 * version and names a tell the rubric has.
 *
 * @returns {{ key: string, severity: string } | null}
 */
export function keyFromTitle(title, rubric) {
  const finding = FINDING_TITLE.exec(title ?? "");
  const aggregate = finding ? null : AGGREGATE_TITLE.exec(title ?? "");
  const parts = finding
    ? { app: finding[1], route: finding[2], tell: finding[3], version: Number(finding[4]) }
    : aggregate
      ? {
          app: aggregate[1],
          route: AGGREGATE_ROUTE,
          tell: aggregate[2],
          version: Number(aggregate[3]),
        }
      : null;
  const tell = parts && tellsById(rubric).get(parts.tell);
  if (!tell || parts.version !== rubric.rubric_version) return null;
  return {
    key: findingKey(parts, parts.version),
    severity: aggregate ? "P1" : tell.default_severity,
  };
}

/**
 * Reconcile every `ui-quality`-labelled issue with the findings ledger
 * (re-review N3). An unknown issue whose title names a finding key at the
 * current rubric version — and that key is not already carried by another
 * issue — is adopted under that key. Any other unknown issue blocks filing,
 * and asks for one escalation issue unless an open one already exists.
 * Escalation issues themselves are never unknown.
 *
 * @param {Record<string, object>} ledger
 * @param {Array<{number: number, title: string, state: string}>} labelled
 * @param {object} rubric
 * @returns {{ adopted: Array<{key: string, issue: number, state: string, severity: string}>, blocked: number[], escalationOpen: number[], escalation: object|null }}
 */
export function reconcileLabelled(ledger, labelled, rubric) {
  const isEscalation = (i) => i.title === ESCALATION_TITLE;
  const unknown = new Set(
    unknownLabelledIssues(
      ledger,
      labelled.filter((i) => !isEscalation(i)).map((i) => i.number)
    )
  );
  const candidates = labelled
    .filter((i) => unknown.has(i.number) && !isEscalation(i))
    .sort((a, b) => a.number - b.number);
  const adopted = [];
  const blocked = [];
  for (const issue of candidates) {
    const parsed = keyFromTitle(issue.title, rubric);
    const taken =
      parsed !== null &&
      (Number.isInteger(ledger[parsed.key]?.issue) || adopted.some((a) => a.key === parsed.key));
    if (parsed === null || taken) {
      if (!blocked.includes(issue.number)) blocked.push(issue.number);
      continue;
    }
    adopted.push({
      key: parsed.key,
      issue: issue.number,
      state: String(issue.state).toLowerCase(),
      severity: parsed.severity,
    });
  }
  const escalationOpen = labelled
    .filter((i) => isEscalation(i) && String(i.state).toLowerCase() === "open")
    .map((i) => i.number);
  const escalation =
    blocked.length === 0 || escalationOpen.length > 0
      ? null
      : {
          action: "escalate",
          title: ESCALATION_TITLE,
          labels: ESCALATION_LABELS,
          unknown: blocked,
          body: escalationBody(blocked),
        };
  return { adopted, blocked, escalationOpen, escalation };
}

function escalationBody(blocked) {
  return [
    "The daily `mbe-ui-quality` fire has stopped filing findings: these `ui-quality`-labelled issues are not in the findings ledger (`metrics/ui-quality-findings.json` on `ui-quality/ledger`), and their titles are not a current finding title the fire could adopt under its key.",
    "",
    ...blocked.map((n) => `- #${n}`),
    "",
    "Recovery, per issue:",
    "- If it is a finding this loop filed, retitle it to its finding title (`ui-quality: <app> <route> — <tell-id> (rubric v<N>)` at the current rubric version); the next fire adopts it under that key.",
    "- Otherwise remove the `ui-quality` label from it.",
    "",
    "Then close this issue. While it is open the fire keeps refusing to file and does not open another; a later block after it is closed opens a new one.",
  ].join("\n");
}

export function titleFor(finding, version) {
  return `ui-quality: ${finding.app} ${finding.route} — ${finding.tell} (rubric v${version})`;
}

function aggregateTitle(app, tell, version) {
  return `ui-quality: ${app} — ${tell} on multiple routes (rubric v${version})`;
}

/** GitHub's heading anchor for `### <tell-id>` in rubric.md. */
const anchorOf = (tell) => tell.toLowerCase().replace(/[^a-z0-9 -]/g, "");

function evidenceLines(ev = {}) {
  return [
    ["message", ev.message],
    ["selector", ev.selector],
    ["href", ev.href],
    ["file", ev.file],
    ["screenshot sha256", ev.screenshot_sha256],
  ]
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `- ${k}: ${v}`);
}

/** Backlog lines (without the leading `- `) that name this finding's title stem. */
function citedSeeds(finding, backlogLines) {
  const stem = `${finding.app} ${finding.route} — ${finding.tell}`;
  return backlogLines.filter((l) => l.startsWith("- ") && l.includes(stem)).map((l) => l.slice(2));
}

export function bodyFor(finding, key, { legacy, backlogLines = [] } = {}) {
  const seeds = citedSeeds(finding, backlogLines);
  return [
    `**${finding.tell}** (${finding.severity}) on \`${finding.app}\` route \`${finding.route}\`.`,
    "",
    "Evidence:",
    ...evidenceLines(finding.evidence),
    ...(legacy === undefined ? [] : ["", `Reproduces legacy [Audit] #${legacy}.`]),
    ...(seeds.length === 0 ? [] : ["", "Backlog seeds:", ...seeds.map((s) => `- ${s}`)]),
    "",
    `Rubric: ${RUBRIC_URL}#${anchorOf(finding.tell)}`,
    `Finding key: \`${key}\``,
  ].join("\n");
}

function aggregateBody(app, tell, severity, members, key) {
  return [
    `**${tell}** (${severity}) on ${members.length} \`${app}\` routes in one fire.`,
    "",
    ...members.map(([, f]) => `- \`${f.route}\`: ${f.evidence?.message ?? "(no message)"}`),
    "",
    `Rubric: ${RUBRIC_URL}#${anchorOf(tell)}`,
    `Finding key: \`${key}\``,
  ].join("\n");
}

const labelsFor = (severity) => [LABEL.base, severity === "P1" ? LABEL.p1 : LABEL.p2, "ready"];

/** Concatenate every source, refuse unknown tells, one finding per key, sorted by key. */
export function normaliseFindings(sources, rubric) {
  const tells = tellsById(rubric);
  const all = sources.flat();
  const unknown = [...new Set(all.map((f) => f?.tell).filter((t) => !tells.has(t)))];
  if (unknown.length > 0) {
    throw new Error(
      `unknown tell id(s) ${unknown.map((t) => JSON.stringify(t)).join(", ")} — plan only reads detect.mjs output validated against the rubric; this is a pipeline bug`
    );
  }
  const byKey = new Map();
  for (const f of all) {
    const key = findingKey(f, rubric.rubric_version);
    if (!byKey.has(key)) byKey.set(key, { ...f, severity: tells.get(f.tell).default_severity });
  }
  return [...byKey.entries()].sort(([a], [b]) => byString(a, b));
}

/** Split out the P1 bursts: (app, tell) groups larger than P1_BURST_AGGREGATE_AT. */
function aggregateUnits(entries, version) {
  const groups = new Map();
  for (const entry of entries) {
    const [, f] = entry;
    if (f.severity !== "P1") continue;
    const g = `${f.app}|${f.tell}`;
    groups.set(g, [...(groups.get(g) ?? []), entry]);
  }
  return [...groups.values()]
    .filter((members) => members.length > P1_BURST_AGGREGATE_AT)
    .map((members) => {
      const [, first] = members[0];
      const key = findingKey({ ...first, route: AGGREGATE_ROUTE }, version);
      return {
        key,
        base: {
          key,
          title: aggregateTitle(first.app, first.tell, version),
          body: aggregateBody(first.app, first.tell, "P1", members, key),
          labels: labelsFor("P1"),
          severity: "P1",
          carrier: "aggregate",
          members: members.map(([k]) => k),
        },
      };
    });
}

/** fileIssue() over the fetched state map; a prior issue with no state is skipped + reported. */
function decide(key, base, prior, { issueLedger, states, reports }) {
  if (prior !== undefined && states[prior] === undefined) {
    reports.push(`${key}: issue #${prior} has no state — skipped`);
    return { action: "skip", issue: prior, reported: true };
  }
  const ledger = prior === undefined ? issueLedger : { ...issueLedger, [key]: prior };
  const result = fileIssue({ ...base, dedupeKey: key }, ledger, {
    getIssueState: (n) => states[n],
    createIssue: () => null,
    reopenIssue: () => {},
  });
  return { action: result.action, issue: result.issueNumber, reported: false };
}

function isFixCandidate(finding, record) {
  const file = finding.evidence?.file;
  return (
    FIX_PR_TELLS.includes(finding.tell) &&
    typeof file === "string" &&
    file.length > 0 &&
    !FIX_PR_EXCLUDED_PREFIXES.some((p) => file.startsWith(p)) &&
    !String(record?.carrier ?? "").startsWith("fix-pr:")
  );
}

/**
 * @param {object} input
 * @param {object[][]} input.sources   Finding[] per --findings file
 * @param {Record<string, object>} input.ledger   metrics/ui-quality-findings.json
 * @param {Record<string, string>} input.states   issue number → open|closed|missing
 * @param {object} input.rubric
 * @param {"pass"|"failed"|"stale"} input.calibrationStatus
 * @param {string[]} [input.backlogLines]   docs/backlog.md, one entry per line
 * @param {Array<{key: string, issue: number, severity: string}>} [input.adopted]
 *   issues `reconcileLabelled` adopted — `input.ledger` and `input.states`
 *   already carry them; a key no finding of this fire names is emitted as an
 *   `adopt` action so `record` writes it
 * @returns {{ actions: object[], seeds: object[], fix_pr_candidate: string|null, dropped: string[], reports: string[] }}
 */
export function planFindings({
  sources,
  ledger,
  states,
  rubric,
  calibrationStatus,
  backlogLines = [],
  adopted = [],
}) {
  const version = rubric.rubric_version;
  const tells = tellsById(rubric);
  const normalised = normaliseFindings(sources, rubric);
  const isAgentBuilt = ([, f]) => tells.get(f.tell).face === "agent-built";
  const dropped =
    calibrationStatus === "pass" ? [] : normalised.filter(isAgentBuilt).map(([k]) => k);
  const kept = normalised.filter(([k]) => !dropped.includes(k));
  const aggregates = aggregateUnits(kept, version);
  const aggregated = new Set(aggregates.flatMap((a) => a.base.members));
  const ctx = {
    issueLedger: Object.fromEntries(
      Object.entries(ledger)
        .filter(([, rec]) => Number.isInteger(rec.issue))
        .map(([key, rec]) => [key, rec.issue])
    ),
    states,
    reports: [],
  };
  const units = [
    ...kept.filter(([k]) => !aggregated.has(k)).map(([key, finding]) => ({ key, finding })),
    ...aggregates,
  ].sort((a, b) => byString(a.key, b.key));

  const actions = [];
  const seeds = [];
  let p2Budget = MAX_P2_ISSUES_PER_FIRE;
  for (const unit of units) {
    if (unit.base) {
      actions.push({ ...unit.base, ...strip(decide(unit.key, unit.base, undefined, ctx)) });
      continue;
    }
    const { key, finding } = unit;
    const record = ledger[key];
    const ledgered = ctx.issueLedger[key] !== undefined;
    const legacy = !ledgered && Number.isInteger(finding.legacy) ? finding.legacy : undefined;
    const base = {
      key,
      title: titleFor(finding, version),
      body: bodyFor(finding, key, { legacy, backlogLines }),
      labels: labelsFor(finding.severity),
      severity: finding.severity,
      carrier: "issue",
      ...(legacy === undefined ? {} : { legacy }),
    };
    if (!ledgered && record?.carrier === "seed") {
      actions.push({ ...base, carrier: "seed", action: "skip", issue: null });
      continue;
    }
    const decision = decide(key, base, ctx.issueLedger[key] ?? legacy, ctx);
    if (decision.action === "create" && finding.severity === "P2") {
      if (p2Budget === 0) {
        seeds.push({ key, title: base.title, severity: finding.severity });
        continue;
      }
      p2Budget -= 1;
    }
    const linked = legacy !== undefined && decision.action === "skip" && !decision.reported;
    actions.push({ ...base, ...strip(decision), ...(linked ? { action: "comment" } : {}) });
  }

  const findingOf = new Map(kept);
  const candidate = actions.find(
    (a) => a.carrier === "issue" && isFixCandidate(findingOf.get(a.key), ledger[a.key])
  );
  const planned = new Set(actions.map((a) => a.key));
  const adoptions = [];
  for (const a of adopted.filter((x) => !planned.has(x.key))) {
    adoptions.push({
      key: a.key,
      action: "adopt",
      issue: a.issue,
      carrier: "issue",
      severity: a.severity,
    });
  }

  return {
    actions: [...actions, ...adoptions].map((a) =>
      a === candidate ? { ...a, fix_pr_candidate: true } : a
    ),
    seeds,
    fix_pr_candidate: candidate?.key ?? null,
    dropped,
    reports: ctx.reports,
  };
}

const strip = ({ action, issue }) => ({ action, issue });
