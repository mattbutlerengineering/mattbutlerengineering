import { execSync } from "node:child_process";

export async function dbListTables(): Promise<string> {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return JSON.stringify({ error: "DATABASE_URL not set" });
    }

    const output = execSync(
      `psql "${dbUrl}" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"`,
      { encoding: "utf-8" }
    );
    const tables = output.trim().split("\n").filter(Boolean);
    return JSON.stringify({ tables }, null, 2);
  } catch (error) {
    return JSON.stringify({ error: "Failed to list tables", message: error instanceof Error ? error.message : String(error) });
  }
}

export async function dbMigrationStatus(): Promise<string> {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return JSON.stringify({ error: "DATABASE_URL not set" });
    }

    const output = execSync(
      `psql "${dbUrl}" -t -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 20;"`,
      { encoding: "utf-8" }
    );
    const migrations = output.trim().split("\n").filter(Boolean).map((line) => line.trim());
    return JSON.stringify({ migrations }, null, 2);
  } catch (error) {
    return JSON.stringify({ error: "Failed to get migration status", message: error instanceof Error ? error.message : String(error) });
  }
}
