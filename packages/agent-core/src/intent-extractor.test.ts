import { describe, it, expect, vi, beforeEach } from "vitest";
import { IssueIntentSchema, extractIssueIntent } from "./intent-extractor.js";

const mockMessagesCreate = vi.fn();

// Mock dynamic import
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockClient {
      messages = {
        create: mockMessagesCreate,
      };
    },
  };
});

describe("IssueIntentSchema", () => {
  it("validates a correct intent object", () => {
    const validIntent = {
      summary: "Fix the bug",
      acceptanceCriteria: ["Bug is fixed", "Test passes"],
      affectedFiles: ["src/bug.ts"],
      estimatedScope: "small",
      taskDescription: "The bug in src/bug.ts causes a crash. Fix it.",
    };

    const result = IssueIntentSchema.safeParse(validIntent);
    expect(result.success).toBe(true);
  });
});

describe("extractIssueIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns structured intent on success", async () => {
    const mockIntent = {
      summary: "Summary",
      acceptanceCriteria: ["A"],
      estimatedScope: "small",
      taskDescription: "Description",
    };

    mockMessagesCreate.mockResolvedValue({
      content: [
        { type: "text", text: "Thinking..." },
        { type: "tool_use", name: "extract_intent", input: mockIntent },
      ],
    });

    const result = await extractIssueIntent("Title", "Body", 123);
    expect(result).toEqual(mockIntent);
    expect(mockMessagesCreate).toHaveBeenCalled();
  });

  it("returns null when no tool_use is found", async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "I can't do that." }],
    });

    const result = await extractIssueIntent("Title", "Body", 123);
    expect(result).toBeNull();
  });

  it("returns null when SDK throws", async () => {
    mockMessagesCreate.mockRejectedValue(new Error("API Error"));

    const result = await extractIssueIntent("Title", "Body", 123);
    expect(result).toBeNull();
  });
});
