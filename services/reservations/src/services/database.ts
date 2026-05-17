import { createDatabase } from "@mbe/database";
import { PrismaClient } from "../generated/prisma/index.js";

const db = createDatabase(PrismaClient as never);

export const prisma = db.prisma;
export const getSlowQueryStats = db.getSlowQueryStats;
export const getPoolStats = db.getPoolStats;
export const getPoolMetrics = db.getPoolMetrics;
export const getServiceStatus = db.getServiceStatus;
export type { PoolMetrics } from "@mbe/database";
