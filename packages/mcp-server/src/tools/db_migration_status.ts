import { execSync } from "node:child_process";

const SERVICES = ["users", "reservations", "agent"];

async function getMigrationStatus(service: string): Promise<{ service: string; pending: string[]; applied: string[]; error?: string }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return { service, pending: [], applied: [], error: "DATABASE_URL not set" };
  }

  const prismaMigrationsPath = `services/${service}/prisma/migrations`;

  try {
    const output = execSync(
      `ls -1 ${prismaMigrationsPath} 2>/dev/null || echo ""`,
      { encoding: "utf-8", timeout: 5000 }
    );
    const migrations = output.trim().split("\n").filter(Boolean);

    const dbOutput = execSync(
      `psql "${dbUrl}" -t -c "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC;"`,
      { encoding: "utf-8", timeout: 15000 }
    );
    const appliedMigrations = dbOutput.trim().split("\n").filter(Boolean).map((m: string) => m.trim());

    const pending = migrations.filter((m: string) => !appliedMigrations.includes(m));

    return { service, pending, applied: appliedMigrations.slice(0, 10) };
  } catch (error) {
    return { service, pending: [], applied: [], error: String(error) };
  }
}

export async function dbMigrationStatus(): Promise<string> {
  const results = await Promise.all(SERVICES.map(getMigrationStatus));
  return JSON.stringify(results, null, 2);
}
