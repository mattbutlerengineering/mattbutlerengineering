import { createDatabase } from "@mbe/database";
import { PrismaClient } from "../generated/prisma/index.js";

export const db = createDatabase(PrismaClient as never);
export const prisma = db.prisma as unknown as PrismaClient;
