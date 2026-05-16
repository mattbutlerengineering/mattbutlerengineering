#!/usr/bin/env node
const SENTRY_TOKEN = process.env.SENTRY_ACCESS_TOKEN;
if (!SENTRY_TOKEN) {
  console.error("SENTRY_ACCESS_TOKEN not set");
  process.exit(1);
}

async function fetchIssues() {
  const orgSlug = "mattbutlerengineering";

  try {
    const response = await fetch(
      `https://sentry.io/api/0/organizations/${orgSlug}/issues/?statsPeriod=14d&sort=freq&limit=20`,
      { headers: { Authorization: `Bearer ${SENTRY_TOKEN}`, "Content-Type": "application/json" } }
    );

    if (!response.ok) throw new Error(`Sentry API error: ${response.status}`);
    const issues = await response.json();

    console.log(`Found ${issues.length} issues in last 14 days\n`);

    for (const issue of issues.slice(0, 10)) {
      console.log(`## ${issue.title}`);
      console.log(`   ID: ${issue.id}`);
      console.log(`   Events: ${issue.count}`);
      console.log("");
    }

    return issues;
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

fetchIssues();
