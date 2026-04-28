const SERVICES = [
  { name: "users", url: "http://localhost:3001/health" },
  { name: "reservations", url: "http://localhost:3004/health" },
  { name: "agent", url: "http://localhost:3003/health" },
];

export async function serviceHealthCheck(): Promise<string> {
  const results = await Promise.allSettled(
    SERVICES.map(async (svc) => {
      const start = Date.now();
      try {
        const res = await fetch(svc.url, { method: "GET" });
        const latency = Date.now() - start;
        return {
          service: svc.name,
          status: res.ok ? "healthy" : "unhealthy",
          statusCode: res.status,
          latencyMs: latency,
        };
      } catch {
        return {
          service: svc.name,
          status: "unreachable",
          statusCode: null,
          latencyMs: null,
        };
      }
    })
  );

  const output = results.map((r) => (r.status === "fulfilled" ? r.value : r.reason));
  return JSON.stringify(output, null, 2);
}
