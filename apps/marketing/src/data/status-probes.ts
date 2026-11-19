export const STATUS_SERVICES = [
  { name: "Users API", url: "/api/v1/users/health" },
  { name: "Reservations API", url: "/api/v1/reservations/health" },
  { name: "Agent API", url: "/api/gen/health" },
] as const;

export const STATUS_SITES = [
  { name: "Marketing", url: "/" },
  { name: "Hospitality", url: "/hospitality/" },
  { name: "Rialto", url: "/rialto/" },
] as const;

/**
 * Where the AI-health dashboard's sensor snapshot lives — same static file
 * `/ai-health` reads (#9016). /status reads the `e2eStability` entry from it
 * so the two pages can't disagree: a sensor Unavailable there must not sit
 * next to an unqualified "Operational" rollup here.
 */
export const STATUS_SENSOR_REPORT_URL = "/sensor-report.json";

export interface ProbeFixture {
  status: number;
  contentType?: string;
  body: string;
}

/**
 * Canned answer for one of the /status page's own probes, or undefined for any
 * other request. The ui-quality capture serves the built dist with no backend,
 * so without this the page's probes 502 and file a false bugs/failed-request.
 */
export function statusProbeFixture(url: string, method: string): ProbeFixture | undefined {
  if (method === "GET" && STATUS_SERVICES.some((s) => s.url === url)) {
    return {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", version: "capture" }),
    };
  }
  if (method === "HEAD" && STATUS_SITES.some((s) => s.url === url)) {
    return { status: 200, body: "" };
  }
  return undefined;
}
