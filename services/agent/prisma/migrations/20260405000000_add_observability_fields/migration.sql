-- Add failure_category to sessions for structured failure analytics
ALTER TABLE "sessions" ADD COLUMN "failure_category" TEXT;

-- Add per-turn observability metrics columns to session_events
ALTER TABLE "session_events" ADD COLUMN "turn_index" INTEGER;
ALTER TABLE "session_events" ADD COLUMN "input_tokens" INTEGER;
ALTER TABLE "session_events" ADD COLUMN "output_tokens" INTEGER;
ALTER TABLE "session_events" ADD COLUMN "thinking_tokens" INTEGER;
ALTER TABLE "session_events" ADD COLUMN "cost_usd" DOUBLE PRECISION;
ALTER TABLE "session_events" ADD COLUMN "model_id" TEXT;

-- Add tool call latency columns to session_events
ALTER TABLE "session_events" ADD COLUMN "tool_name" TEXT;
ALTER TABLE "session_events" ADD COLUMN "tool_use_id" TEXT;
ALTER TABLE "session_events" ADD COLUMN "tool_latency_ms" INTEGER;
ALTER TABLE "session_events" ADD COLUMN "tool_is_error" BOOLEAN;

-- Index for efficient event-type queries (cost/latency analytics)
CREATE INDEX "session_events_session_id_type_idx" ON "session_events"("session_id", "type");
