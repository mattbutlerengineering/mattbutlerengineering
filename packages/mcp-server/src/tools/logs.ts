import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { glob } from "glob";

export async function checkLogs(service?: string) {
  const logDir = service ? join("services", service, "logs") : "services/*/logs";
  const files = await glob(join(logDir, "*.log"));
  
  if (files.length === 0) {
    return "No log files found.";
  }

  let result = "Recent Logs:\n\n";
  for (const file of files.slice(-3)) { // Limit to 3 most recent files
    const content = await readFile(file, "utf8");
    result += `--- ${file} ---\n${content.split("\n").slice(-20).join("\n")}\n\n`;
  }
  
  return result;
}
