-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
    "task_description" TEXT NOT NULL,
    "branch_name" TEXT,
    "base_branch" TEXT NOT NULL DEFAULT 'main',
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    "max_turns" INTEGER NOT NULL DEFAULT 50,
    "max_budget_usd" DOUBLE PRECISION NOT NULL DEFAULT 1.00,
    "create_pr" BOOLEAN NOT NULL DEFAULT true,
    "pr_url" TEXT,
    "pr_number" INTEGER,
    "result_text" TEXT,
    "cost_usd" DOUBLE PRECISION,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "num_turns" INTEGER,
    "duration_ms" INTEGER,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "sdk_session_id" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "parent_id" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_specs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "raw_lines" JSONB NOT NULL,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stored_specs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "sessions_parent_id_idx" ON "sessions"("parent_id");

-- CreateIndex
CREATE INDEX "session_events_session_id_created_at_idx" ON "session_events"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "stored_specs_user_id_created_at_idx" ON "stored_specs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "stored_specs_user_id_is_favorite_idx" ON "stored_specs"("user_id", "is_favorite");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
