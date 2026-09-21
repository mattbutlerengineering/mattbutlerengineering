#!/usr/bin/env node

/**
 * preview-worker-sweep.mjs — remediation pass for leaked `mbe-preview-*`
 * Cloudflare Workers (#4670).
 *
 * `scripts/resource-audit.mjs` is the *detector*: it lists live Workers, diffs
 * them against the repo's wrangler.toml/Pulumi definitions, and files
 * "Orphaned resources found (N)". Nothing in the repo could *remediate* what
 * it found, so the number only ever grew — 165 on 2026-08-29, 199 on
 * 2026-09-19, 201 by the time #4670 was triaged. This script is that missing
 * half.
 *
 * ## What is NOT the root cause
 *
 * The obvious hypothesis — "no teardown exists" — is false, and was measured
 * false before this script was written. `.github/workflows/preview-deploy.yml`
 * has carried a `cleanup` job gated on `github.event.action == 'closed'` since
 * the preview feature shipped (#530), and it works today: PR #5555 merged at
 * 2026-09-21T00:20:46Z, run 35549255234's sibling run 35547410837 fired on the
 * `closed` action, and its Cleanup Preview job (106175712028) logged
 * `Successfully deleted mbe-preview-5555-marketing`. Re-adding a second
 * `pull_request: closed` teardown would duplicate a proven one, and two
 * workflows racing to delete the same script would make the loser's 404 look
 * like a failure.
 *
 * So the 199 `mbe-preview-*` orphans are a *backlog*, accumulated through the
 * gaps a per-PR hook structurally cannot cover:
 *
 *   - `preview-deploy.yml`'s `pull_request` trigger carries a `paths:` filter
 *     (`apps`, `packages/rialto`, `packages/rialto-catalog`). A PR that
 *     deploys a preview and is
 *     then force-pushed to a diff no longer touching those paths gets no
 *     `closed` run at all, so nothing deletes its preview.
 *   - Its `concurrency: preview-<pr>` group is `cancel-in-progress: true`, so
 *     a `closed` run can be cancelled by a later run in the same group
 *     (close → reopen → close) and take the cleanup with it.
 *   - Its delete step is `wrangler delete ... 2>/dev/null && echo Deleted ||
 *     echo "No preview"`, which reports a genuine failure (expired token,
 *     API outage) identically to an already-absent worker, and goes green
 *     either way. Whatever it failed to delete is invisible.
 *   - Anything leaked before the feature worked, or by a workflow revision
 *     since fixed, was never retried by anyone.
 *
 * A sweep is the right shape for all four: it reconciles live state against
 * PR state rather than reacting to one event, so it is indifferent to which
 * gap leaked a given worker.
 *
 * ## Safety
 *
 * This deletes production infrastructure, so every decision fails closed:
 *
 *   - A worker is a sweep candidate only if its name matches
 *     `mbe-preview-<digits>-<app>` exactly, anchored at both ends. The two
 *     genuinely unmanaged Workers in this account — `butler-api` (legacy) and
 *     `eat-sheet` (a separate live project of the owner's) — cannot match, and
 *     are additionally recorded in `infrastructure/resource-allowlist.json`
 *     so the audit stops reporting them.
 *   - A candidate is deleted only on a PR state this script positively
 *     recognises as finished (`CLOSED` / `MERGED`). An open PR, an
 *     unrecognised state, an absent state, and a *failed lookup* all resolve
 *     to `pr-state-unknown` and skip. There is no branch that deletes because
 *     a lookup was inconclusive.
 *   - Dry run is the default. Deleting requires an explicit `--confirm`, which
 *     `.github/workflows/preview-teardown.yml` only passes when a human types
 *     it into the `workflow_dispatch` form.
 *
 * Design follows the house pattern (`merge-queue-eligibility.mjs`,
 * `ci-gate-status.mjs`, `rescue-automation-prs.mjs`): the decisions are pure
 * and unit-tested without the network
 * (`scripts/__tests__/preview-worker-sweep.test.mjs`), the side effects live
 * behind injected callbacks in `runPreviewSweep`, and the CLI below is a thin
 * caller wiring those to the Cloudflare API and `gh`. Imports are Node
 * builtins only, so the workflow needs no `pnpm install` (see
 * `scripts/check-workflow-deps.mjs`).
 *
 * Usage:
 *   node scripts/preview-worker-sweep.mjs              # dry run: report only
 *   node scripts/preview-worker-sweep.mjs --confirm    # actually delete
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * A preview worker name, anchored at both ends: `mbe-preview-<pr>-<app>`.
 *
 * The app segment is any lowercase slug rather than a fixed
 * marketing|hospitality|rialto-web alternation on purpose. A hard-coded app
 * list is the failure mode `.claude/rules/gotchas.md` records for
 * `rialto-web-visual.yml` — a checked-in scope that silently stops covering
 * things added later, reading as covered while pinning nothing. A fourth app
 * would leak previews forever behind such a list. The `mbe-preview-<digits>-`
 * prefix is already unambiguous, repo-owned, and produced by exactly one
 * line of exactly one workflow (`preview-deploy.yml`'s `WORKER_NAME`).
 */
export const PREVIEW_WORKER_PATTERN = /^mbe-preview-(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Pure: reads the PR number and app out of a preview worker name.
 *
 * @param {unknown} name - a live Cloudflare Worker script name
 * @returns {{pr: number, app: string} | null} null when the name is not one
 *   of ours — which is the only thing standing between this sweep and
 *   `eat-sheet`.
 */
export function parsePreviewWorkerName(name) {
  if (typeof name !== "string") return null;
  const match = PREVIEW_WORKER_PATTERN.exec(name);
  if (!match) return null;
  return { pr: parseInt(match[1], 10), app: match[2] };
}

/**
 * Pure: collapses a GitHub PR state into "is this PR finished?".
 *
 * `gh pr view --json state` answers OPEN / CLOSED / MERGED. MERGED and CLOSED
 * are the same thing here — a merged PR's preview is just as dead as an
 * abandoned one's. Everything else, including an absent or non-string value,
 * is `unknown` rather than a guess: this function's answer authorises a
 * deletion, so the unrecognised case must be the safe one.
 *
 * @param {unknown} raw
 * @returns {"open" | "closed" | "unknown"}
 */
export function normalizePrState(raw) {
  if (typeof raw !== "string") return "unknown";
  const state = raw.trim().toUpperCase();
  if (state === "OPEN") return "open";
  if (state === "CLOSED" || state === "MERGED") return "closed";
  return "unknown";
}

/** Reads a PR number out of either a Map or a plain object of PR states. */
function lookupPrState(prStates, pr) {
  if (prStates instanceof Map) {
    return prStates.has(pr) ? prStates.get(pr) : prStates.get(String(pr));
  }
  return prStates?.[pr];
}

/**
 * Pure: decides what to do with a single live Worker.
 *
 * @param {{name: string, prStates: Record<number, string> | Map<number, string>}} input
 * @returns {{name: string, action: "delete" | "skip", reason: string, pr?: number, app?: string}}
 */
export function decidePreviewWorkerSweep({ name, prStates }) {
  const parsed = parsePreviewWorkerName(name);
  if (!parsed) {
    return { name, action: "skip", reason: "not-a-preview-worker" };
  }

  const state = normalizePrState(lookupPrState(prStates, parsed.pr));
  if (state === "closed") {
    return { name, action: "delete", reason: "pr-closed", pr: parsed.pr, app: parsed.app };
  }
  return {
    name,
    action: "skip",
    reason: state === "open" ? "pr-open" : "pr-state-unknown",
    pr: parsed.pr,
    app: parsed.app,
  };
}

/**
 * Pure: a decision for every live Worker, in input order.
 *
 * Every worker gets an entry — including the skips — so the dispatch's report
 * accounts for the whole account rather than only the rows it acted on. A
 * sweep that printed just its deletions would make "nothing matched" and
 * "everything was refused" look identical.
 *
 * @param {{workers?: string[], prStates: Record<number, string> | Map<number, string>}} input
 */
export function planPreviewSweep({ workers, prStates }) {
  return (workers ?? []).map((name) => decidePreviewWorkerSweep({ name, prStates }));
}

/**
 * Pure: classifies a Cloudflare delete response.
 *
 * 404 is a success: the sweep's whole job is reconciling toward absent, and
 * a worker someone else already removed is absent. A missing/unknown status
 * is a failure — never a silent success, which is precisely the ambiguity
 * that makes `preview-deploy.yml`'s `2>/dev/null` cleanup unable to report
 * what it failed to delete.
 *
 * @param {number | undefined} httpStatus
 * @returns {"deleted" | "already-gone" | "failed"}
 */
export function classifyDeleteOutcome(httpStatus) {
  if (httpStatus === 404) return "already-gone";
  if (typeof httpStatus === "number" && httpStatus >= 200 && httpStatus < 300) return "deleted";
  return "failed";
}

/**
 * Resolves the state of every PR that owns at least one candidate worker.
 *
 * One lookup per distinct PR, not per worker — a PR owns up to three
 * previews. A lookup that throws leaves its key absent, which
 * `decidePreviewWorkerSweep` reads as `pr-state-unknown` and skips; that is
 * the fail-closed path, so the throw is deliberately not rethrown.
 */
async function resolvePrStates(workers, getPrState, log) {
  const prNumbers = [
    ...new Set(
      workers
        .map((name) => parsePreviewWorkerName(name))
        .filter((parsed) => parsed !== null)
        .map((parsed) => parsed.pr)
    ),
  ];
  const entries = new Map();

  for (const pr of prNumbers) {
    try {
      entries.set(pr, await getPrState(pr));
    } catch (err) {
      log(
        `could not determine state of PR #${pr} (${err.message}) — refusing to delete its previews`
      );
    }
  }

  return entries;
}

/**
 * Thin wrapper: plans the sweep, then executes it only when confirmed.
 *
 * @param {object} deps
 * @param {() => Promise<string[]>} deps.listWorkers
 * @param {(pr: number) => Promise<string>} deps.getPrState
 * @param {(name: string) => Promise<number>} deps.deleteWorker - resolves to an HTTP status
 * @param {boolean} [deps.confirm=false] - dry run unless explicitly true
 * @param {(msg: string) => void} [deps.log]
 */
export async function runPreviewSweep({
  listWorkers,
  getPrState,
  deleteWorker,
  confirm = false,
  log = () => {},
}) {
  const workers = await listWorkers();
  const prStates = await resolvePrStates(workers, getPrState, log);
  const plan = planPreviewSweep({ workers, prStates });

  const summary = {
    dryRun: !confirm,
    total: plan.length,
    planned: plan.filter((d) => d.action === "delete").map((d) => d.name),
    skipped: plan.filter((d) => d.action === "skip").map((d) => d.name),
    deleted: [],
    alreadyGone: [],
    failed: [],
  };

  for (const decision of plan.filter((d) => d.action === "skip")) {
    log(`skip ${decision.name}: ${decision.reason}`);
  }

  for (const decision of plan.filter((d) => d.action === "delete")) {
    if (!confirm) {
      log(`[dry-run] would delete ${decision.name} (PR #${decision.pr} is closed)`);
      continue;
    }

    // Isolated per worker: one 500 from Cloudflare must not strand the
    // remaining candidates, the way an un-caught throw would.
    let outcome;
    try {
      outcome = classifyDeleteOutcome(await deleteWorker(decision.name));
    } catch (err) {
      outcome = "failed";
      log(`failed to delete ${decision.name}: ${err.message}`);
    }

    if (outcome === "deleted") {
      summary.deleted.push(decision.name);
      log(`deleted ${decision.name} (PR #${decision.pr} is closed)`);
    } else if (outcome === "already-gone") {
      summary.alreadyGone.push(decision.name);
      log(`${decision.name} was already gone`);
    } else {
      summary.failed.push(decision.name);
    }
  }

  return summary;
}

// ── CLI ─────────────────────────────────────────────────────────────

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Cloudflare's live Worker script list — the same endpoint resource-audit.mjs reads. */
async function cfListWorkers(accountId, token) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    throw new Error(`CF worker list failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (!json.success) {
    throw new Error(`CF worker list error: ${JSON.stringify(json.errors)}`);
  }
  return json.result.map((script) => script.id);
}

/**
 * Deletes one Worker script and returns the raw HTTP status for
 * `classifyDeleteOutcome` to judge.
 *
 * The Cloudflare REST API is used rather than `wrangler delete` on purpose:
 * it yields a status code (so 404 is distinguishable from 403, unlike
 * `preview-deploy.yml`'s `2>/dev/null` shell), it needs no per-app
 * wrangler.toml, and it does not prompt for interactive confirmation.
 */
async function cfDeleteWorker(accountId, token, name) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${encodeURIComponent(name)}?force=true`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  return res.status;
}

async function run() {
  const confirm = process.argv.includes("--confirm");
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const token = requireEnv("CLOUDFLARE_API_TOKEN");

  const summary = await runPreviewSweep({
    listWorkers: () => cfListWorkers(accountId, token),
    getPrState: async (pr) =>
      execFileSync("gh", ["pr", "view", String(pr), "--json", "state", "-q", ".state"], {
        encoding: "utf-8",
      }).trim(),
    deleteWorker: (name) => cfDeleteWorker(accountId, token, name),
    confirm,
    log: (msg) => console.log(`[preview-worker-sweep] ${msg}`),
  });

  console.log(
    `[preview-worker-sweep] ${summary.dryRun ? "[dry-run] " : ""}${summary.total} worker(s) seen, ` +
      `${summary.planned.length} preview(s) with a closed PR, ` +
      `${summary.deleted.length} deleted, ${summary.alreadyGone.length} already gone, ` +
      `${summary.failed.length} failed`
  );

  // A failed delete must red the job. Reporting the finding and exiting 0
  // would make this script decorative in exactly the way the workflow it
  // replaces was.
  if (summary.failed.length > 0) {
    console.error(`[preview-worker-sweep] could not delete: ${summary.failed.join(", ")}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error(`[preview-worker-sweep] failed: ${err.message}`);
    process.exit(1);
  });
}
