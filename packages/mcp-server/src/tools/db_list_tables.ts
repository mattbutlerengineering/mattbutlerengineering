import { execSync } from "node:child_process";

export async function dbListTables(): Promise<string> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return JSON.stringify({ error: "DATABASE_URL environment variable not set" });
  }

  try {
    const output = execSync(
      `psql "${dbUrl}" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"`,
      { encoding: "utf-8", timeout: 15000 }
    );
    const tables = output.trim().split("\n").filter(Boolean).map((t: string) => t.trim());
    return JSON.stringify({ tables }, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: "Failed to list tables", details: message });
  }
}
