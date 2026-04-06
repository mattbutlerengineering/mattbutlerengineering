import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { pulumiStackOutputs } from "./tools/pulumi.js";
import { serviceHealthCheck } from "./tools/health.js";
import { ciRunStatus } from "./tools/ci.js";
import { gitWorkflowStatus } from "./tools/git.js";
import { dbListTables, dbMigrationStatus } from "./tools/database.js";

const server = new Server(
  {
    name: "mbe-infra-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const TOOLS = [
  {
    name: "pulumi_stack_outputs",
    description: "List all outputs from the Pulumi production stack",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "service_health_check",
    description: "Check health status of all backend services (users, reservations, agent)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ci_run_status",
    description: "Get latest GitHub Actions run status for all workflows",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "git_workflow_status",
    description: "Get current branch, uncommitted changes, and CI status",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "db_list_tables",
    description: "List all tables in the database",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "db_migration_status",
    description: "Show applied Prisma migrations",
    inputSchema: { type: "object", properties: {} },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  try {
    if (name === "pulumi_stack_outputs") {
      const result = await pulumiStackOutputs();
      return { content: [{ type: "text", text: result }] };
    }

    if (name === "service_health_check") {
      const result = await serviceHealthCheck();
      return { content: [{ type: "text", text: result }] };
    }

    if (name === "ci_run_status") {
      const result = await ciRunStatus();
      return { content: [{ type: "text", text: result }] };
    }

    if (name === "git_workflow_status") {
      const result = await gitWorkflowStatus();
      return { content: [{ type: "text", text: result }] };
    }

    if (name === "db_list_tables") {
      const result = await dbListTables();
      return { content: [{ type: "text", text: result }] };
    }

    if (name === "db_migration_status") {
      const result = await dbMigrationStatus();
      return { content: [{ type: "text", text: result }] };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
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
