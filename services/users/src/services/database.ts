import { PrismaClient } from "../generated/prisma/index.js";

// Cap Prisma's internal connection pool to avoid exceeding PgBouncer's
// session-mode pool_size. DigitalOcean managed Postgres defaults to ~25
// total connections; with 3 services sharing the pooler, each gets ~7.
const CONNECTION_LIMIT = parseInt(process.env.PRISMA_CONNECTION_LIMIT ?? "5", 10);

export const prisma = new PrismaClient({
  datasourceUrl: appendConnectionLimit(process.env.DATABASE_URL, CONNECTION_LIMIT),
});

function appendConnectionLimit(url: string | undefined, limit: number): string | undefined {
  if (!url) return undefined;
  const separator = url.includes("?") ? "&" : "?";
  if (url.includes("connection_limit=")) return url;
  return `${url}${separator}connection_limit=${limit}`;
}

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
