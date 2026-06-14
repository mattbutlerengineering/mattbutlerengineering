import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { defineTool, listTools, callTool } from "./dispatcher.js";
import { pulumiStackOutputs } from "./tools/pulumi.js";
import { serviceHealthCheck } from "./tools/health.js";
import { ciRunStatus } from "./tools/ci.js";
import { gitWorkflowStatus } from "./tools/git.js";
import { dbListTables, dbMigrationStatus } from "./tools/database.js";
import { deployStatus } from "./tools/deploy_status.js";
import { checkLogs } from "./tools/logs.js";

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
  defineTool({
    name: "pulumi_stack_outputs",
    description: "List all outputs from the Pulumi production stack",
    inputSchema: z.object({}),
    handler: () => pulumiStackOutputs(),
  }),
  defineTool({
    name: "service_health_check",
    description: "Check health status of all backend services (users, reservations, agent)",
    inputSchema: z.object({}),
    handler: () => serviceHealthCheck(),
  }),
  defineTool({
    name: "ci_run_status",
    description: "Get latest GitHub Actions run status for all workflows",
    inputSchema: z.object({}),
    handler: () => ciRunStatus(),
  }),
  defineTool({
    name: "deploy_status",
    description: "Get current DigitalOcean App Platform deployment status",
    inputSchema: z.object({}),
    handler: () => deployStatus(),
  }),
  defineTool({
    name: "git_workflow_status",
    description: "Get current branch, uncommitted changes, and CI status",
    inputSchema: z.object({}),
    handler: () => gitWorkflowStatus(),
  }),
  defineTool({
    name: "db_list_tables",
    description: "List all tables in the database",
    inputSchema: z.object({}),
    handler: () => dbListTables(),
  }),
  defineTool({
    name: "check_logs",
    description: "Read recent logs from backend services",
    inputSchema: z.object({
      service: z.string().optional().describe("Optional service name (users, reservations, agent)"),
    }),
    handler: ({ service }) => checkLogs(service),
  }),
  defineTool({
    name: "db_migration_status",
    description: "Show applied Prisma migrations",
    inputSchema: z.object({}),
    handler: () => dbMigrationStatus(),
  }),
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listTools(TOOLS),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return callTool(TOOLS, request.params.name, request.params.arguments ?? {});
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
