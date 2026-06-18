/**
 * Health performance handler — 7-day latency trends per service.
 *
 * Extracted from edge-router.js.
 */

/**
 * Handle GET /health/performance — 7-day latency trends per service.
 */
async function handleHealthPerformance(env) {
  const days = 7;
  const keys = [];
  const now = new Date();

  for (let h = 0; h < days * 24; h++) {
    const d = new Date(now.getTime() - h * 3600_000);
    keys.push(`latency/${d.toISOString().slice(0, 13).replace("T", "-")}`);
  }

  // Batch in groups of 50 to avoid overwhelming KV
  const samples = [];
  for (let i = 0; i < keys.length; i += 50) {
    const batch = keys.slice(i, i + 50);
    const results = await Promise.all(batch.map((key) => env.HEALTH_STATE.get(key, "json")));
    for (const r of results) {
      if (r) samples.push(r);
    }
  }

  if (samples.length === 0) {
    return new Response(
      JSON.stringify({
        message: "No latency data available yet. Samples are recorded twice daily.",
        samplesCollected: 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // Aggregate per-service latencies
  const serviceLatencies = {};
  for (const sample of samples) {
    const services = sample.services ?? {};
    for (const [name, data] of Object.entries(services)) {
      if (data.latency == null) continue;
      if (!serviceLatencies[name]) serviceLatencies[name] = [];
      serviceLatencies[name].push(data.latency);
    }
  }

  const serviceStats = {};
  const alerts = [];

  for (const [name, latencies] of Object.entries(serviceLatencies)) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Index] ?? sorted[sorted.length - 1];

    const recentCount = Math.max(1, Math.floor(sorted.length * 0.1));
    const recentLatencies = latencies.slice(-recentCount);
    const recentSorted = [...recentLatencies].sort((a, b) => a - b);
    const recentP95Index = Math.floor(recentSorted.length * 0.95);
    const recentP95 = recentSorted[recentP95Index] ?? recentSorted[recentSorted.length - 1];

    const trend =
      recentP95 > avg * 1.5 ? "degrading" : recentP95 < avg * 0.8 ? "improving" : "stable";

    serviceStats[name] = {
      avgMs: Math.round(avg),
      p95Ms: Math.round(p95),
      recentP95Ms: Math.round(recentP95),
      samples: latencies.length,
      trend,
    };

    if (trend === "degrading") {
      alerts.push(
        `${name}: p95 ${Math.round(recentP95)}ms exceeds 1.5x average (${Math.round(avg)}ms)`
      );
    }
  }

  return new Response(
    JSON.stringify({
      periodDays: days,
      samplesCollected: samples.length,
      services: serviceStats,
      alerts,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    }
  );
}

export { handleHealthPerformance };
