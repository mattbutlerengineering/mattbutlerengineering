import { createShellRunner } from "../shell-runner.js";

const defaultListRun = createShellRunner({ errorLabel: "Failed to list tables" });
const defaultMigrationRun = createShellRunner({ errorLabel: "Failed to get migration status" });

export async function dbListTables(run = defaultListRun): Promise<string> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return JSON.stringify({ error: "DATABASE_URL not set" });
  }
  const output = run(
    `psql "${dbUrl}" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"`
  );
  try {
    const asJson = JSON.parse(output) as { error?: string };
    if (asJson.error !== undefined) {
      return output;
    }
  } catch {
    // not JSON — treat as psql text output
  }
  const tables = output.trim().split("\n").filter(Boolean);
  return JSON.stringify({ tables }, null, 2);
}

export async function dbMigrationStatus(run = defaultMigrationRun): Promise<string> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return JSON.stringify({ error: "DATABASE_URL not set" });
  }
  const output = run(
    `psql "${dbUrl}" -t -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 20;"`
  );
  try {
    const asJson = JSON.parse(output) as { error?: string };
    if (asJson.error !== undefined) {
      return output;
    }
  } catch {
    // not JSON — treat as psql text output
  }
  const migrations = output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.trim());
  return JSON.stringify({ migrations }, null, 2);
}
