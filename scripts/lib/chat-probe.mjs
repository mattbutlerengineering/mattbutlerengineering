/**
 * Pure logic for the post-deploy live chat probe (#9481): the scripted prompts,
 * the reply classifier, the dedupe key, the cost guard and the issue builder.
 * All I/O (auth, fetch, filing) lives in `scripts/chat-probe.mjs` and the
 * workflow. Nothing here touches the network.
 *
 * Safety invariant: the probe NEVER confirms a write. `buildRequestBody` has no
 * way to emit `actionConfirm`; a write prompt passes once the server answers
 * with an `action_request` (the pending confirmation), and the run stops there.
 *
 * Cost: every prompt is one single-turn chat-agent request (server cap
 * `maxSteps: 5`, per-identity 30/hr limit, daily spend ceiling). The ceiling is
 * enforced by counting requests against a conservative per-request estimate.
 */
import { createHash } from "node:crypto";

/** Hard ceiling on the estimated spend of one probe run. */
export const COST_CEILING_USD = 0.05;

/** Conservative per-request estimate (a short single-turn chat with tool calls). */
export const ESTIMATED_COST_PER_REQUEST_USD = 0.005;

/** @typedef {{ id: string, prompt: string, expect: "any" | "element" | "confirm" }} ProbePrompt */

/** @type {ReadonlyArray<ProbePrompt>} */
export const PROBE_PROMPTS = Object.freeze([
  { id: "tonight", prompt: "How does tonight look?", expect: "any" },
  {
    id: "table-status",
    prompt: "Show me the status of every table at a glance.",
    expect: "element",
  },
  { id: "open-tables", prompt: "Which tables are open right now?", expect: "any" },
  {
    id: "availability",
    prompt: "What times are open for 2 people on Monday? Show the open times.",
    expect: "any",
  },
  { id: "reservations", prompt: "Show me the reservations for tomorrow.", expect: "any" },
  { id: "guest-search", prompt: "Search guests named Hannah.", expect: "any" },
  { id: "capability-gap", prompt: "Add a party of 4 to the waitlist.", expect: "any" },
  {
    id: "spanish",
    prompt: "Muéstrame las reservaciones de esta noche.",
    expect: "any",
  },
  // The write: must reach the confirm step; the probe never presses Confirm.
  {
    id: "walk-in-confirm-cancelled",
    prompt: "Seat a walk-in party of 2 at any free table right now.",
    expect: "confirm",
  },
]);

/**
 * @param {string} body raw NDJSON response text
 * @returns {object[]} parsed events; blank and unparseable lines are dropped
 */
export function parseNdjson(body) {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

const LEAK_PATTERNS = [
  ["raw-element-call", /\b[A-Z][A-Za-z]+\(\s*[a-z][A-Za-z]*\s*[=:]/],
  ["raw-tool-json", /"(?:op|toolName|toolCallId|toolInput)"\s*:/],
  ["stack-trace", /\n\s+at\s+\S+.*:\d+:\d+|\b\w*Error:\s.*\n\s+at\s/],
  ["undefined-text", /\bundefined\b/],
  ["unrendered-placeholder", /\{\{\s*[\w.]+\s*\}\}|\[\w+ elements? show here\]/],
  ["seam-fallback", /Component could not be displayed/],
];

const BUSY_PATTERN = /assistant is busy right now/i;

/**
 * @param {ProbePrompt} probe
 * @param {{ status: number, events: object[] }} reply
 * @returns {{ verdict: "pass" | "fail" | "inconclusive", failures: Array<{ code: string, detail: string }> }}
 */
export function classifyReply(probe, reply) {
  if (reply.status === 429) return { verdict: "inconclusive", failures: [] };
  if (reply.status !== 200) {
    return {
      verdict: "fail",
      failures: [{ code: `http-${reply.status}`, detail: `HTTP ${reply.status}` }],
    };
  }

  const genError = reply.events.find((e) => typeof e?.$genError === "string");
  if (genError) {
    if (BUSY_PATTERN.test(genError.$genError)) return { verdict: "inconclusive", failures: [] };
    return {
      verdict: "fail",
      failures: [{ code: "gen-error", detail: String(genError.$genError).slice(0, 200) }],
    };
  }

  const failures = [];
  const replyText = reply.events
    .filter((e) => e?.type === "text")
    .map((e) => String(e.content ?? ""))
    .join("");

  for (const [code, pattern] of LEAK_PATTERNS) {
    const match = pattern.exec(replyText);
    if (match) failures.push({ code, detail: match[0].trim().slice(0, 120) });
  }

  const hasElement = reply.events.some((e) => e?.type === "element");
  const hasConfirm = reply.events.some((e) => e?.type === "action_request");

  if (replyText.trim() === "" && !hasElement && !hasConfirm) {
    failures.push({ code: "empty-reply", detail: "no text, element or confirmation" });
  }
  if (probe.expect === "element" && !hasElement) {
    failures.push({ code: "missing-element", detail: "expected a rendered element" });
  }
  if (probe.expect === "confirm" && !hasConfirm) {
    failures.push({ code: "missing-confirmation", detail: "expected a pending confirmation" });
  }

  return { verdict: failures.length > 0 ? "fail" : "pass", failures };
}

/**
 * Stable key for the set of failing (prompt, code) pairs: order-independent,
 * unaffected by passing prompts or by the free-text detail.
 *
 * @param {Array<{ id: string, failures: Array<{ code: string }> }>} results
 */
export function dedupeKey(results) {
  const pairs = results
    .flatMap((r) => r.failures.map((f) => `${r.id}:${f.code}`))
    .sort()
    .join("|");
  return createHash("sha1").update(pairs).digest("hex").slice(0, 10);
}

/** Counts estimated spend and refuses any request that would pass the ceiling. */
export function createCostGuard({
  ceilingUsd = COST_CEILING_USD,
  perRequestUsd = ESTIMATED_COST_PER_REQUEST_USD,
} = {}) {
  let spent = 0;
  return {
    tryReserve() {
      if (spent + perRequestUsd > ceilingUsd + 1e-9) return false;
      spent += perRequestUsd;
      return true;
    },
    spentUsd: () => spent,
  };
}

/**
 * The request body for one probe prompt. There is deliberately no `actionConfirm`
 * parameter: the probe cannot confirm a write.
 */
export function buildRequestBody(probe, { venueId, timeZone }) {
  return {
    messages: [{ role: "user", content: probe.prompt }],
    venueId,
    timeZone,
  };
}

/**
 * Runs every prompt through `send` (injected I/O), stopping when the cost guard
 * refuses. Sequential on purpose: the chat endpoint is rate limited.
 *
 * @param {{
 *   send: (body: object) => Promise<{ status: number, events: object[] }>,
 *   context: { venueId: string, timeZone: string },
 *   guard?: ReturnType<typeof createCostGuard>,
 *   prompts?: ReadonlyArray<ProbePrompt>,
 * }} options
 */
export async function runProbe({
  send,
  context,
  guard = createCostGuard(),
  prompts = PROBE_PROMPTS,
}) {
  const results = [];
  let skipped = 0;
  for (const probe of prompts) {
    if (!guard.tryReserve()) {
      skipped += 1;
      continue;
    }
    let reply;
    try {
      reply = await send(buildRequestBody(probe, context));
    } catch (err) {
      reply = { status: 0, events: [], error: String(err?.message ?? err) };
    }
    const classified = classifyReply(probe, reply);
    results.push({ id: probe.id, prompt: probe.prompt, ...classified });
  }
  return { results, skipped, spentUsd: guard.spentUsd() };
}

/**
 * @param {Array<{ id: string, prompt?: string, failures: Array<{ code: string, detail?: string }> }>} results
 * @param {{ runUrl: string }} context
 * @returns {{ title: string, body: string, dedupeKey: string } | null}
 */
export function buildIssue(results, { runUrl }) {
  const failing = results.filter((r) => r.failures.length > 0);
  if (failing.length === 0) return null;
  const key = dedupeKey(results);
  const rows = failing.map(
    (r) =>
      `- \`${r.id}\` (${r.prompt ?? ""}): ` +
      r.failures.map((f) => `\`${f.code}\`${f.detail ? ` — ${f.detail}` : ""}`).join("; ")
  );
  return {
    title: `Chat probe: live chat regression [${key}]`,
    dedupeKey: key,
    body: [
      "The post-deploy live chat probe (#9481) found failing replies in production.",
      "",
      ...rows,
      "",
      `Run: ${runUrl}`,
      "",
      "The probe never confirms a write. Fix the cause; the next clean run files nothing.",
    ].join("\n"),
  };
}
