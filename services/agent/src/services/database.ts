import { PrismaClient } from "../generated/prisma/index.js";

export const prisma = new PrismaClient();

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
