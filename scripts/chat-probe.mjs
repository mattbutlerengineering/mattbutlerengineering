#!/usr/bin/env node
/**
 * Thin I/O runner for the daily live chat probe (#9481). All decisions
 * live in `scripts/lib/chat-probe.mjs`.
 *
 * Usage: node scripts/chat-probe.mjs <out-dir>
 * Env:   CHAT_PROBE_TOKEN (Auth0 access token), CHAT_PROBE_VENUE_ID,
 *        CHAT_PROBE_TIME_ZONE (default America/Los_Angeles),
 *        CHAT_PROBE_URL (the full chat endpoint), CHAT_PROBE_RUN_URL.
 *
 * Writes <out-dir>/report.json and, when something failed, issue.json plus
 * issue-body.md for `scripts/lib/file-issue-cli.mjs`. Exit 0 = clean,
 * 1 = failing replies found, 2 = the probe itself could not run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildIssue, parseNdjson, runProbe } from "./lib/chat-probe.mjs";

const REQUEST_TIMEOUT_MS = 90_000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) throw new Error("usage: chat-probe.mjs <out-dir>");
  mkdirSync(outDir, { recursive: true });

  const token = requireEnv("CHAT_PROBE_TOKEN");
  const context = {
    venueId: requireEnv("CHAT_PROBE_VENUE_ID"),
    timeZone: process.env.CHAT_PROBE_TIME_ZONE || "America/Los_Angeles",
  };
  // The full chat endpoint comes from the workflow, so this script carries no route literal.
  const chatUrl = requireEnv("CHAT_PROBE_URL");

  const send = async (body) => {
    const response = await fetch(chatUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { status: response.status, events: parseNdjson(await response.text()) };
  };

  const report = await runProbe({ send, context });
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));

  const issue = buildIssue(report.results, {
    runUrl: process.env.CHAT_PROBE_RUN_URL || "(local run)",
  });
  const verdicts = report.results.map((r) => `${r.verdict} ${r.id}`).join("\n");
  process.stdout.write(`${verdicts}\nestimated spend: $${report.spentUsd.toFixed(3)}\n`);

  if (issue) {
    writeFileSync(join(outDir, "issue.json"), JSON.stringify({ title: issue.title }));
    writeFileSync(join(outDir, "issue-body.md"), issue.body);
    process.stdout.write(`::error::chat probe found failures (${issue.title})\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`chat-probe: ${err.message}\n`);
  process.exit(2);
});
