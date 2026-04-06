import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { pulumiStackOutputs } from "./tools/pulumi_stack_outputs.js";
import { serviceHealthCheck } from "./tools/service_health_check.js";
import { ciRunStatus } from "./tools/ci_run_status.js";
import { deployStatus } from "./tools/deploy_status.js";
import { gitWorkflowStatus } from "./tools/git_workflow_status.js";
import { dbListTables } from "./tools/db_list_tables.js";
import { dbMigrationStatus } from "./tools/db_migration_status.js";

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

const TOOLS = [
  {
    name: "pulumi_stack_outputs",
    description: "List outputs from Pulumi stack (infrastructure/pulumi)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "service_health_check",
    description: "Hit health endpoints across services (users, reservations, agent)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "ci_run_status",
    description: "Latest GitHub Actions run status per workflow",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "deploy_status",
    description: "Current DigitalOcean App Platform deployment state",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "git_workflow_status",
    description: "Current branch, pending changes, and CI status",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "db_list_tables",
    description: "List all tables in the database schema (requires DATABASE_URL)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "db_migration_status",
    description: "Show pending/applied migrations per service",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  try {
    let result: string;

    switch (name) {
      case "pulumi_stack_outputs":
        result = await pulumiStackOutputs();
        break;
      case "service_health_check":
        result = await serviceHealthCheck();
        break;
      case "ci_run_status":
        result = await ciRunStatus();
        break;
      case "deploy_status":
        result = await deployStatus();
        break;
      case "git_workflow_status":
        result = await gitWorkflowStatus();
        break;
      case "db_list_tables":
        result = await dbListTables();
        break;
      case "db_migration_status":
        result = await dbMigrationStatus();
        break;
      default:
        throw new Error(`Tool not found: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
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
