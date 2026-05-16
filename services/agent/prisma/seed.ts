import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding agent database...");

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
  const tenMinAgo = new Date(now.getTime() - 10 * 60_000);
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60_000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60_000);

  // --- Succeeded Session 1: Bug fix ---
  const session1 = await prisma.session.create({
    data: {
      status: "SUCCEEDED",
      taskDescription: "Fix login button not responding on mobile viewport",
      branchName: "agent/fix-mobile-login",
      baseBranch: "main",
      model: "claude-sonnet-4-6",
      maxTurns: 50,
      maxBudgetUsd: 1.0,
      createPr: true,
      prUrl: "https://github.com/mattbutlerengineering/mattbutlerengineering/pull/400",
      prNumber: 400,
      resultText: "Fixed mobile login button by correcting CSS media query breakpoint",
      costUsd: 0.42,
      inputTokens: 15200,
      outputTokens: 4800,
      numTurns: 8,
      durationMs: 45000,
      errors: [],
      startedAt: oneHourAgo,
      completedAt: thirtyMinAgo,
    },
  });

  await prisma.sessionEvent.createMany({
    data: [
      { sessionId: session1.id, type: "turn:start", data: { turn: 1 }, createdAt: oneHourAgo },
      { sessionId: session1.id, type: "file:modified", data: { path: "apps/hospitality/src/components/LoginButton.tsx" }, createdAt: new Date(oneHourAgo.getTime() + 10_000) },
      { sessionId: session1.id, type: "turn:end", data: { turn: 8, costUsd: 0.42 }, createdAt: thirtyMinAgo },
      { sessionId: session1.id, type: "pr:created", data: { prUrl: "https://github.com/mattbutlerengineering/mattbutlerengineering/pull/400", prNumber: 400 }, createdAt: thirtyMinAgo },
    ],
  });

  // --- Succeeded Session 2: Feature ---
  const session2 = await prisma.session.create({
    data: {
      status: "SUCCEEDED",
      taskDescription: "Add tooltip component to design system",
      branchName: "agent/add-tooltip",
      baseBranch: "main",
      model: "claude-sonnet-4-6",
      maxTurns: 50,
      maxBudgetUsd: 1.0,
      createPr: true,
      prUrl: "https://github.com/mattbutlerengineering/mattbutlerengineering/pull/405",
      prNumber: 405,
      resultText: "Created Tooltip component with accessibility support and animations",
      costUsd: 0.78,
      inputTokens: 28500,
      outputTokens: 9200,
      numTurns: 14,
      durationMs: 82000,
      errors: [],
      startedAt: thirtyMinAgo,
      completedAt: fiveMinAgo,
    },
  });

  await prisma.sessionEvent.createMany({
    data: [
      { sessionId: session2.id, type: "turn:start", data: { turn: 1 }, createdAt: thirtyMinAgo },
      { sessionId: session2.id, type: "file:created", data: { path: "packages/rialto/src/components/Tooltip.tsx" }, createdAt: new Date(thirtyMinAgo.getTime() + 20_000) },
      { sessionId: session2.id, type: "file:created", data: { path: "packages/rialto/src/components/Tooltip.test.tsx" }, createdAt: new Date(thirtyMinAgo.getTime() + 40_000) },
      { sessionId: session2.id, type: "turn:end", data: { turn: 14, costUsd: 0.78 }, createdAt: fiveMinAgo },
      { sessionId: session2.id, type: "pr:created", data: { prUrl: "https://github.com/mattbutlerengineering/mattbutlerengineering/pull/405", prNumber: 405 }, createdAt: fiveMinAgo },
    ],
  });

  // --- Failed Session ---
  const session3 = await prisma.session.create({
    data: {
      status: "FAILED",
      taskDescription: "Migrate database to use UUID v7 for all primary keys",
      branchName: "agent/uuid-v7-migration",
      baseBranch: "main",
      model: "claude-sonnet-4-6",
      maxTurns: 50,
      maxBudgetUsd: 1.0,
      createPr: false,
      resultText: "Failed: migration affected too many tables, exceeded budget",
      costUsd: 1.0,
      inputTokens: 42000,
      outputTokens: 12000,
      numTurns: 50,
      durationMs: 180000,
      errors: [{ message: "Budget exceeded", turn: 50, timestamp: tenMinAgo.toISOString() }],
      startedAt: oneHourAgo,
      completedAt: tenMinAgo,
    },
  });

  await prisma.sessionEvent.createMany({
    data: [
      { sessionId: session3.id, type: "turn:start", data: { turn: 1 }, createdAt: oneHourAgo },
      { sessionId: session3.id, type: "file:modified", data: { path: "services/users/prisma/schema.prisma" }, createdAt: new Date(oneHourAgo.getTime() + 15_000) },
      { sessionId: session3.id, type: "error", data: { message: "Budget exceeded", turn: 50 }, createdAt: tenMinAgo },
    ],
  });

  console.log("Seeded agent database:", {
    sessions: [session1.id, session2.id, session3.id],
    events: "11 total",
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
