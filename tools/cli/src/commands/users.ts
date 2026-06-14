import { Command } from "commander";
import { apiRequest } from "../api.js";
import { defineCommand, runCommand } from "../command-seam.js";
import type { CommandResult } from "../command-seam.js";
import type { ApiResponse, PaginatedResponse, User } from "@mbe/types";

// ── Pure run functions (return CommandResult, no side effects) ────────────────

export const usersListRun = defineCommand<{ page: string; limit: string }>({
  requiresAuth: true,
  async run(opts): Promise<CommandResult> {
    const response = await apiRequest<PaginatedResponse<User>>(
      `/api/v1/users?page=${opts.page}&limit=${opts.limit}`
    );

    const rows = response.data.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name ?? "-",
    }));

    const { page, totalPages, total } = response.pagination;
    const footer = `Page ${page} of ${totalPages} (${total} total)`;

    return { kind: "rows", rows, footer };
  },
});

export const usersGetRun = defineCommand<{ id: string }>({
  requiresAuth: true,
  async run(opts): Promise<CommandResult> {
    const response = await apiRequest<ApiResponse<User>>(`/api/v1/users/${opts.id}`);
    const user = response.data;

    return {
      kind: "rows",
      rows: [
        { field: "ID", value: user.id },
        { field: "Email", value: user.email },
        { field: "Name", value: user.name ?? "(not set)" },
        { field: "Verified", value: user.emailVerified ? "Yes" : "No" },
        { field: "Created", value: user.createdAt },
        { field: "Updated", value: user.updatedAt },
      ],
    };
  },
});

// ── Commander wiring ──────────────────────────────────────────────────────────

export const usersCommand = new Command("users").description("User management commands");

usersCommand
  .command("list")
  .description("List all users")
  .option("-p, --page <number>", "Page number", "1")
  .option("-l, --limit <number>", "Items per page", "10")
  .option("--json", "Output raw JSON")
  .action(async (opts: { page: string; limit: string; json?: boolean }) => {
    const result = await usersListRun(opts);

    if (result.kind === "rows" && result.rows.length === 0) {
      console.log("No users found");
      return;
    }

    await runCommand(result, opts);
  });

usersCommand
  .command("get <id>")
  .description("Get user by ID")
  .option("--json", "Output raw JSON")
  .action(async (id: string, opts: { json?: boolean }) => {
    const result = await usersGetRun({ id });
    await runCommand(result, opts);
  });
