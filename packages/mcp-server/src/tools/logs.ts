import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { glob } from "glob";

/** Services with a `services/<name>/logs` directory. Keep in sync with health.ts. */
const ALLOWED_SERVICES = ["users", "reservations", "agent"];

function assertValidService(service: string): string {
  const normalized = service.trim().toLowerCase();
  if (!ALLOWED_SERVICES.includes(normalized)) {
    throw new Error(`Invalid service "${service}". Must be one of: ${ALLOWED_SERVICES.join(", ")}`);
  }
  return normalized;
}

export async function checkLogs(service?: string) {
  const logDir = service
    ? join("services", assertValidService(service), "logs")
    : "services/*/logs";
  const files = await glob(join(logDir, "*.log"));

  if (files.length === 0) {
    return "No log files found.";
  }

  let result = "Recent Logs:\n\n";
  for (const file of files.slice(-3)) {
    // Limit to 3 most recent files
    const content = await readFile(file, "utf8");
    result += `--- ${file} ---\n${content.split("\n").slice(-20).join("\n")}\n\n`;
  }

  return result;
}
