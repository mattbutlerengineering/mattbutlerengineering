import { Command } from "commander";
import { getApiUrl } from "../config.js";
import { createCliApiClient } from "../cli-api-client.js";
import { defineCommand, runCommand } from "../command-seam.js";
import type { CommandResult } from "../command-seam.js";
import type { ApiResponse, User } from "@mbe/types";

export const whoamiRun = defineCommand({
  requiresAuth: true,
  async run(): Promise<CommandResult> {
    const response = await createCliApiClient().request<ApiResponse<User>>("/api/v1/users/me");
    const user = response.data;
    return {
      kind: "rows",
      rows: [
        { field: "ID", value: user.id },
        { field: "Email", value: user.email },
        { field: "Name", value: user.name ?? "(not set)" },
        { field: "API", value: getApiUrl() },
      ],
    };
  },
});

export const whoamiCommand = new Command("whoami")
  .description("Show current user info")
  .option("--json", "Output raw JSON")
  .action(async (opts: { json?: boolean }) => {
    const result = await whoamiRun({});
    await runCommand(result, opts);
  });
