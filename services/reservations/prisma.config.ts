import { defineConfig } from "prisma/config";

// Lazy DATABASE_URL: prisma/config's env() helper throws at load time when
// the var is unset, breaking `prisma generate` in CI where no database is
// configured. The placeholder lets load succeed; verbs that actually open a
// connection (db push, migrate dev/deploy) will fail with a proper connection
// error if DATABASE_URL was never set.
const url =
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url },
});
