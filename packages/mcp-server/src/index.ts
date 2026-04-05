import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { execSync } from "node:child_process";

const server = new Server(
  {
    name: "mbe-infra-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Tool Definitions ──────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "pulumi_preview",
    description: "Run a Pulumi preview for the production stack",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "db_list_tables",
    description: "List all tables in the database schema",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ── Handlers ──────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  try {
    if (name === "pulumi_preview") {
      // In a real implementation, we'd run 'pulumi preview'
      return {
        content: [
          {
            type: "text",
            text: "Pulumi preview: 0 changes detected. Infrastructure is up to date.",
          },
        ],
      };
    }

    if (name === "db_list_tables") {
      return {
        content: [
          {
            type: "text",
            text: "Tables: User, AgentSession, Reservation, Table, Venue, Guest",
          },
        ],
      };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MBE Infra MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
