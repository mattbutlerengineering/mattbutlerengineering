import { z } from "zod";

type McpContent = { type: "text"; text: string };

type McpResult = {
  content: McpContent[];
  isError?: boolean;
};

export type ToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  inputSchema: TSchema;
  handler: (args: z.infer<TSchema>) => Promise<string>;
};

export function defineTool<TSchema extends z.ZodTypeAny>(
  def: ToolDefinition<TSchema>
): ToolDefinition<TSchema> {
  return def;
}

type JsonSchemaObject = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

export function listTools(tools: ToolDefinition[]): Array<{
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
}> {
  return tools.map((t) => {
    const raw = z.toJSONSchema(t.inputSchema) as JsonSchemaObject;
    // MCP spec requires type: 'object' at root; strip the $schema sentinel
    const { $schema: _, ...rest } = raw as { $schema?: string } & JsonSchemaObject;
    return {
      name: t.name,
      description: t.description,
      inputSchema: rest as JsonSchemaObject,
    };
  });
}

function errorEnvelope(message: string): McpResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export async function callTool(
  tools: ToolDefinition[],
  name: string,
  args: unknown
): Promise<McpResult> {
  const tool = tools.find((t) => t.name === name);

  if (!tool) {
    return errorEnvelope(`Tool not found: ${name}`);
  }

  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) {
    return errorEnvelope(`Validation invalid: ${parsed.error.message}`);
  }

  try {
    const text = await tool.handler(parsed.data);
    return { content: [{ type: "text", text }] };
  } catch (error) {
    return errorEnvelope(error instanceof Error ? error.message : String(error));
  }
}
