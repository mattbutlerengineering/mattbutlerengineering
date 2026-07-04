import { readFileSync } from "fs";
import { defineConfig } from "prisma/config";

// NOTE: this file must stay dependency-free (only Node builtins + "prisma/config").
// It is loaded via a relative import (not the "@mbe/database" package specifier) from
// each service's prisma.config.ts so it also resolves inside the DB-migrate Docker
// image, which copies raw source files without running `pnpm install` — see
// infrastructure/migrate/Dockerfile.
function loadEnvFile(): void {
  try {
    const content = readFileSync(".env", "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      const val = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env not present (CI, Docker) — rely on environment
  }
}

/** Builds the shared Prisma config: loads `.env` (if present), then wires DATABASE_URL. */
export function createPrismaConfig() {
  loadEnvFile();

  const url =
    process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder";

  return defineConfig({
    schema: "prisma/schema.prisma",
    datasource: { url },
  });
}
