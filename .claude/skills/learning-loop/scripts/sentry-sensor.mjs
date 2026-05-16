#!/usr/bin/env node
const SENTRY_TOKEN = process.env.SENTRY_ACCESS_TOKEN;
if (!SENTRY_TOKEN) {
  console.error("SENTRY_ACCESS_TOKEN not set");
  process.exit(1);
}

async function getSentryMetrics() {
  try {
    const response = await fetch(
      "https://sentry.io/api/0/organizations/mattbutlerengineering/issues/?statsPeriod=7d&limit=50",
      {
        headers: { Authorization: `Bearer ${SENTRY_TOKEN}`, "Content-Type": "application/json" },
      }
    );
    if (!response.ok) throw new Error(`Sentry API error: ${response.status}`);
    const issues = await response.json();
    const result = {
      timestamp: new Date().toISOString(),
      period: "7d",
      metrics: {
        totalErrors: issues.reduce((sum, i) => sum + parseInt(i.count || 0), 0),
        uniqueErrors: issues.length,
        affectedUsers: issues.reduce((sum, i) => sum + (i.userCount || 0), 0),
      },
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}
getSentryMetrics();
