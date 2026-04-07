import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding users database...");

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Admin User",
      emailVerified: true,
      preferences: {
        theme: "dark",
        timezone: "America/New_York",
        notifications: { email: true, sms: false, push: true },
      },
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@example.com" },
    update: {},
    create: {
      email: "manager@example.com",
      name: "Sarah Manager",
      emailVerified: true,
      preferences: {
        theme: "light",
        timezone: "America/Chicago",
        notifications: { email: true, sms: true, push: true },
      },
    },
  });

  const host = await prisma.user.upsert({
    where: { email: "host@example.com" },
    update: {},
    create: {
      email: "host@example.com",
      name: "Alex Host",
      emailVerified: false,
      preferences: {
        theme: "system",
        timezone: "America/Los_Angeles",
        notifications: { email: true, sms: false, push: false },
      },
    },
  });

  console.log("Seeded users:", { admin: admin.id, manager: manager.id, host: host.id });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
