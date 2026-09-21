#!/usr/bin/env node
import { countEventsInWindow } from "../../../../scripts/sentry-triage-recency.mjs";

const STATS_PERIOD = "14d";
const SENTRY_TOKEN = process.env.SENTRY_ACCESS_TOKEN;
if (!SENTRY_TOKEN) {
  console.error("SENTRY_ACCESS_TOKEN not set");
  process.exit(1);
}

async function fetchIssues() {
  const orgSlug = "mattbutlerengineering";

  try {
    const response = await fetch(
      // `groupStatsPeriod` is what selects the per-issue `stats` series on
      // the ORGANIZATION endpoint — `statsPeriod` alone leaves it at the
      // 24h default (measured 2026-09-20). The project endpoint triage.mjs
      // uses honours `statsPeriod` instead; the two differ, so neither
      // parameter can be dropped here.
      `https://sentry.io/api/0/organizations/${orgSlug}/issues/?statsPeriod=${STATS_PERIOD}&groupStatsPeriod=${STATS_PERIOD}&sort=freq&limit=20`,
      { headers: { Authorization: `Bearer ${SENTRY_TOKEN}`, "Content-Type": "application/json" } }
    );

    if (!response.ok) throw new Error(`Sentry API error: ${response.status}`);
    const issues = await response.json();

    // `statsPeriod` selects which `stats` series is returned; it does NOT
    // bound the result set by `lastSeen`, so this list routinely includes
    // issues with zero events in the window (#5534/#5535/#5536).
    console.log(`Found ${issues.length} issues (stats window: ${STATS_PERIOD})\n`);

    for (const issue of issues.slice(0, 10)) {
      const inWindow = countEventsInWindow(issue, STATS_PERIOD);
      console.log(`## ${issue.title}`);
      console.log(`   ID: ${issue.id}`);
      console.log(
        `   Events: ${inWindow ?? "unknown"} in ${STATS_PERIOD} (${issue.count} lifetime)`
      );
      console.log(`   Last seen: ${issue.lastSeen}`);
      console.log("");
    }

    return issues;
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

fetchIssues();
