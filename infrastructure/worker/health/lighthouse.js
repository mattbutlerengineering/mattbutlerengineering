/**
 * Health lighthouse handler — 30-day Lighthouse score trends per app.
 *
 * Extracted from edge-router.js.
 */

/**
 * Handle GET /health/lighthouse — 30-day Lighthouse score trends per app.
 */
async function handleHealthLighthouse(env) {
  const listResult = await env.HEALTH_STATE.list({ prefix: "lighthouse/" });
  const keys = listResult.keys.map((k) => k.name);

  if (keys.length === 0) {
    return new Response(
      JSON.stringify({
        message: "No Lighthouse data available yet. Scores are recorded weekly.",
        appsTracked: 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const entries = await Promise.all(keys.map(async (key) => env.HEALTH_STATE.get(key, "json")));
  const scores = entries.filter(Boolean);

  // Group by app
  const byApp = {};
  for (const score of scores) {
    if (!byApp[score.app]) byApp[score.app] = [];
    byApp[score.app].push(score);
  }

  const apps = {};
  const alerts = [];
  const categories = ["performance", "accessibility", "bestPractices", "seo"];

  for (const [app, appScores] of Object.entries(byApp)) {
    const sorted = appScores.sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const twoWeeksAgo =
      sorted.find((s) => {
        const d = new Date(s.date);
        const cutoff = new Date(Date.now() - 14 * 86400_000);
        return d <= cutoff;
      }) ?? sorted[0];

    const appStats = { latest: {}, trend: {}, dataPoints: sorted.length };

    for (const cat of categories) {
      appStats.latest[cat] = latest[cat] ?? null;
      const diff = (latest[cat] ?? 0) - (twoWeeksAgo[cat] ?? 0);
      appStats.trend[cat] = diff > 5 ? "improving" : diff < -5 ? "degrading" : "stable";

      if (diff < -5) {
        alerts.push(
          `${app}: ${cat} dropped ${Math.abs(Math.round(diff))} points (${twoWeeksAgo[cat]} → ${latest[cat]})`
        );
      }
    }

    apps[app] = appStats;
  }

  return new Response(JSON.stringify({ periodDays: 30, apps, alerts }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export { handleHealthLighthouse };
