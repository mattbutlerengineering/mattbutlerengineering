/**
 * Health uptime handler — computes 30-day uptime percentages from KV snapshots.
 *
 * Extracted from edge-router.js.
 */

/**
 * Handle GET /health/uptime — compute uptime percentages from daily snapshots.
 */
async function handleHealthUptime(env) {
  const days = 30;
  const keys = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(`uptime/${d.toISOString().slice(0, 10)}`);
  }

  const snapshots = await Promise.all(keys.map(async (key) => env.HEALTH_STATE.get(key, "json")));

  const valid = snapshots.filter(Boolean);
  const totalDays = valid.length;

  if (totalDays === 0) {
    return new Response(
      JSON.stringify({
        uptime: null,
        message: "No snapshots available yet. Snapshots are recorded daily.",
        daysTracked: 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const subsystemCounts = {};
  let overallHealthy = 0;

  for (const entry of valid) {
    const snap = entry.snapshot ?? entry;
    if (snap.status === "healthy") overallHealthy++;

    if (snap.services) {
      for (const [name, svc] of Object.entries(snap.services)) {
        if (!subsystemCounts[name]) subsystemCounts[name] = { healthy: 0, total: 0 };
        subsystemCounts[name].total++;
        if (svc.status === "healthy" || svc.status === "ok") subsystemCounts[name].healthy++;
      }
    }
  }

  const subsystems = {};
  for (const [name, counts] of Object.entries(subsystemCounts)) {
    subsystems[name] = {
      uptimePercent: parseFloat(((counts.healthy / counts.total) * 100).toFixed(2)),
      healthyDays: counts.healthy,
      totalDays: counts.total,
    };
  }

  return new Response(
    JSON.stringify({
      uptimePercent: parseFloat(((overallHealthy / totalDays) * 100).toFixed(2)),
      healthyDays: overallHealthy,
      totalDays,
      periodDays: days,
      subsystems,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    }
  );
}

export { handleHealthUptime };
