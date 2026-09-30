/**
 * ledger-audit.mjs — the pure decisions behind `ledger.mjs due` and
 * `ledger.mjs record` (docs/features/ui-quality-loop/architecture.md
 * § Interfaces `ledger.mjs`). No I/O: rows, manifests and judge-status come in
 * as values, new rows and counts go out.
 *
 * `reachability` — the row's outcome at its last fire — takes exactly these values:
 *   audited                 captured AND judged; the only value that advances
 *                           `last_audited_at` + `rubric_version`
 *   unjudged:<reason>       captured, not judged (tool-error | malformed | missing);
 *                           dates untouched, so the row stays due
 *   unreachable:auth        auth0-gated; never attempted
 *   unreachable:build       planned but not captured (no manifest row, an
 *                           errored row with no screenshots, or no fixture)
 */

/** Kinds a capture can visit. A redirect renders no page of its own — its target is its own row. */
export const AUDITABLE_KINDS = ["page", "not-found"];

const DAY_MS = 24 * 60 * 60 * 1000;

const keyOf = ({ app, route }) => `${app}|${route}`;

/** A route template that cannot be navigated to as written. */
export function isParameterised(route) {
  return route.includes(":") || route.includes("*");
}

/** App-relative URL path for a route, via fixtures for parameterised ones; null when unresolvable. */
export function resolvePath(row, fixtures) {
  if (isParameterised(row.route)) return fixtures?.[row.app]?.[row.route] ?? null;
  return row.route === "/" ? "/" : `/${row.route}`;
}

/**
 * Never audited, changed since its last audit, or audited more than
 * `ttlDays` ago. An unjudged/unreachable row keeps its old dates, so whatever
 * made it due still holds next fire.
 */
export function isDue(row, { now, ttlDays }) {
  if (!row.last_audited_at) return true;
  const audited = Date.parse(row.last_audited_at);
  if (row.last_changed_at && Date.parse(row.last_changed_at) > audited) return true;
  return Date.parse(now) - audited > ttlDays * DAY_MS;
}

/** Staleness-first: never-audited rows, then oldest audit; ties by (app, route). */
function byStaleness(a, b) {
  const at = a.last_audited_at ?? "";
  const bt = b.last_audited_at ?? "";
  if (at !== bt) return at < bt ? -1 : 1;
  return keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0;
}

/**
 * The fire's due set.
 * @returns {{ due: Array<{app, route, path: string|null, detail?: string}>,
 *   unreachableAuth: Array<{app, route}> }}
 */
export function selectDue(rows, { now, ttlDays, maxRoutes, fixtures }) {
  const candidates = rows
    .filter((r) => AUDITABLE_KINDS.includes(r.kind) && isDue(r, { now, ttlDays }))
    .sort(byStaleness);
  const unreachableAuth = candidates
    .filter((r) => r.auth === "auth0")
    .map(({ app, route }) => ({ app, route }));
  const due = candidates
    .filter((r) => r.auth !== "auth0")
    .slice(0, maxRoutes)
    .map((r) => {
      const path = resolvePath(r, fixtures);
      return path === null
        ? { app: r.app, route: r.route, path: null, detail: "no-fixture" }
        : { app: r.app, route: r.route, path };
    });
  return { due, unreachableAuth };
}

/** `.ui-quality/plan.json`: `{ app → [{ route, path, viewports }] }`, capturable rows only. */
export function buildPlan(due, viewports) {
  const plan = {};
  for (const d of due) {
    if (d.path === null) continue;
    (plan[d.app] ??= []).push({ route: d.route, path: d.path, viewports });
  }
  return Object.fromEntries(
    Object.keys(plan)
      .sort()
      .map((app) => [app, plan[app]])
  );
}

/** New rows with `reachability` replaced for the given keys. */
function withReachability(rows, updates) {
  return rows.map((r) => (updates.has(keyOf(r)) ? { ...r, ...updates.get(keyOf(r)) } : r));
}

export function markUnreachableAuth(rows, unreachableAuth) {
  return withReachability(
    rows,
    new Map(unreachableAuth.map((r) => [keyOf(r), { reachability: "unreachable:auth" }]))
  );
}

/**
 * One due row's outcome.
 * @param {object|undefined} captured - its manifest row, if any
 * @param {object|null} judgeStatus - parsed judge-status.json, null when the file is absent
 */
function outcomeFor(d, captured, judgeStatus) {
  if (!captured || !(captured.screenshots?.length > 0)) return "unreachable:build";
  if (judgeStatus === null) return "unjudged:missing";
  const status = judgeStatus.routes?.[d.app]?.[d.route];
  if (status === "judged") return "audited";
  return typeof status === "string" && status.startsWith("unjudged:") ? status : "unjudged:missing";
}

/**
 * Apply one fire's captures + judge-status to the ledger.
 * @param {object[]} rows - current ledger
 * @param {{ due: object[], unreachable_auth: object[] }} dueFile
 * @param {Record<string, object[]>} manifests - app → manifest rows
 * @param {object|null} judgeStatus
 * @returns {{ rows: object[], counts: { due, audited, unreachable: {auth, build}, unjudged, dropped_tells } }}
 */
export function applyRecord(rows, { dueFile, manifests, judgeStatus, now, rubricVersion }) {
  const updates = new Map();
  const counts = { audited: 0, build: 0, unjudged: 0 };
  for (const d of dueFile.due) {
    const captured = (manifests[d.app] ?? []).find((m) => m.route === d.route);
    const outcome = outcomeFor(d, captured, judgeStatus);
    if (outcome === "audited") {
      counts.audited += 1;
      updates.set(keyOf(d), {
        reachability: outcome,
        last_audited_at: now,
        rubric_version: rubricVersion,
      });
    } else {
      counts[outcome === "unreachable:build" ? "build" : "unjudged"] += 1;
      updates.set(keyOf(d), { reachability: outcome });
    }
  }
  for (const a of dueFile.unreachable_auth) {
    updates.set(keyOf(a), { reachability: "unreachable:auth" });
  }
  return {
    rows: withReachability(rows, updates),
    counts: {
      due: dueFile.due.length,
      audited: counts.audited,
      unreachable: { auth: dueFile.unreachable_auth.length, build: counts.build },
      unjudged: counts.unjudged,
      dropped_tells: judgeStatus?.dropped?.length ?? 0,
    },
  };
}
