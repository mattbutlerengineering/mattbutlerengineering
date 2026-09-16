import { createDatabase } from "@mbe/database";
import { PrismaClient } from "../generated/prisma/index.js";
import { withVenueScopedQueries } from "./venue-scoped-prisma.js";

export const db = createDatabase(PrismaClient as never);

/**
 * Venue-scoped `prisma` export (ADR-026 part 6) — every model-delegate query
 * issued through this object runs inside a transaction that first sets
 * `app.venue_id` for the current request. See `./venue-scoped-prisma.ts` for
 * why this wrapping exists and what it deliberately leaves unwrapped.
 */
export const prisma = withVenueScopedQueries(db.prisma as unknown as PrismaClient);
