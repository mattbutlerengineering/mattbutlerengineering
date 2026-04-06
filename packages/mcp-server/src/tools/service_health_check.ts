const SERVICE_ENDPOINTS = [
  { name: "users", url: "http://localhost:3001/health" },
  { name: "reservations", url: "http://localhost:3004/health" },
  { name: "agent", url: "http://localhost:3003/health" },
];

export async function serviceHealthCheck(): Promise<string> {
  const results = await Promise.allSettled(
    SERVICE_ENDPOINTS.map(async (service) => {
      try {
        const response = await fetch(service.url, { method: "GET" });
        return {
          name: service.name,
          status: response.ok ? "healthy" : "unhealthy",
          statusCode: response.status,
        };
      } catch {
        return {
          name: service.name,
          status: "unreachable",
          statusCode: 0,
        };
      }
    })
  );

  const formatted = SERVICE_ENDPOINTS.map((service, index) => {
    const result = results[index];
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      name: service.name,
      status: "error",
      error: result.reason?.message || "Unknown error",
    };
  });

  return JSON.stringify(formatted, null, 2);
}
