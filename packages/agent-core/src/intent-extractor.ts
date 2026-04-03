import { z } from "zod";
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("@mbe/agent-core");

/**
 * Structured intent extracted from a GitHub issue.
 *
 * The schema is used both for Zod validation and as the tool input_schema
 * for forced tool use with Claude Haiku.
 */
export const IssueIntentSchema = z.object({
  summary: z
    .string()
    .max(200)
    .describe("One-sentence task description for the agent"),
  acceptanceCriteria: z
    .array(z.string())
    .max(10)
    .describe("Concrete, testable criteria for the agent to satisfy"),
  affectedFiles: z
    .array(z.string())
    .optional()
    .describe("File paths likely to be modified (best guess from issue context)"),
  estimatedScope: z
    .enum(["trivial", "small", "medium", "large"])
    .describe(
      "trivial: typo/config fix; small: 1-2 files; medium: 3-10 files; large: 10+ files or architecture change"
    ),
  taskDescription: z
    .string()
    .max(2000)
    .describe("Complete, self-contained agent task prompt with all context"),
});

export type IssueIntent = z.infer<typeof IssueIntentSchema>;

/**
 * JSON Schema representation of IssueIntentSchema for the Claude tool_use API.
 * Manually defined to avoid the zod-to-json-schema dependency.
 */
const INTENT_TOOL_SCHEMA = {
  type: "object" as const,
  required: ["summary", "acceptanceCriteria", "estimatedScope", "taskDescription"],
  properties: {
    summary: { type: "string", maxLength: 200, description: "One-sentence task description for the agent" },
    acceptanceCriteria: {
      type: "array",
      items: { type: "string" },
      maxItems: 10,
      description: "Concrete, testable criteria for the agent to satisfy",
    },
    affectedFiles: {
      type: "array",
      items: { type: "string" },
      description: "File paths likely to be modified (best guess)",
    },
    estimatedScope: {
      type: "string",
      enum: ["trivial", "small", "medium", "large"],
      description: "trivial: typo/config; small: 1-2 files; medium: 3-10 files; large: 10+ or arch change",
    },
    taskDescription: { type: "string", maxLength: 2000, description: "Complete agent task prompt" },
  },
} as const;

/**
 * Extract structured intent from a GitHub issue using Claude Haiku.
 *
 * Uses forced tool_use to guarantee structured JSON output, then validates
 * with Zod. Falls back to null on any failure — callers should use the
 * raw issue text as a fallback when this returns null.
 *
 * Cost: ~$0.002 per extraction with Haiku.
 */
export async function extractIssueIntent(
  issueTitle: string,
  issueBody: string,
  issueNumber: number
): Promise<IssueIntent | null> {
  const span = tracer.startSpan("agent_core.extract_intent", {
    attributes: { "issue.number": issueNumber },
  });

  try {
    // Dynamic import to avoid requiring @anthropic-ai/sdk as a direct dependency.
    // The SDK is available at runtime when called from the agent service.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Anthropic = (await import("@anthropic-ai/sdk" as any)).default as any;
    const client = new Anthropic();

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system:
        "You extract structured task intent from GitHub issues for an autonomous coding agent. " +
        "The taskDescription field must be a complete, self-contained prompt that gives the agent " +
        "everything it needs to work without reading the original issue. Include the issue number " +
        "and any relevant context from the issue body.",
      messages: [
        {
          role: "user",
          content: `Issue #${issueNumber}: ${issueTitle}\n\n${issueBody || "No description provided."}`,
        },
      ],
      tools: [
        {
          name: "extract_intent",
          description: "Extract structured issue intent for the agent",
          input_schema: INTENT_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool" as const, name: "extract_intent" },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolUse = (response.content as any[]).find((b: any) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      span.setAttribute("extraction.success", false);
      return null;
    }

    const intent = IssueIntentSchema.parse(toolUse.input);
    span.setAttribute("extraction.success", true);
    span.setAttribute("extraction.scope", intent.estimatedScope);
    return intent;
  } catch {
    span.setAttribute("extraction.success", false);
    // Return null — callers fall back to raw issue text
    return null;
  } finally {
    span.end();
  }
}
