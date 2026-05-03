import { Command } from "commander";
import { isAuthenticated } from "../config.js";
import { apiRequest } from "../api.js";
import type { ApiResponse, PaginatedResponse, User } from "@mbe/types";

export const usersCommand = new Command("users").description("User management commands");

usersCommand
  .command("list")
  .description("List all users")
  .option("-p, --page <number>", "Page number", "1")
  .option("-l, --limit <number>", "Items per page", "10")
  .action(async (options) => {
    if (!isAuthenticated()) {
      console.log("Not logged in. Run: mbe login");
      process.exit(1);
    }

    try {
      const response = await apiRequest<PaginatedResponse<User>>(
        `/api/v1/users?page=${options.page}&limit=${options.limit}`
      );

      if (response.data.length === 0) {
        console.log("No users found");
        return;
      }

      console.log("Users");
      console.log("-----");
      for (const user of response.data) {
        console.log(`${user.id}\t${user.email}\t${user.name ?? "-"}`);
      }
      console.log("");
      console.log(
        `Page ${response.pagination.page} of ${response.pagination.totalPages} (${response.pagination.total} total)`
      );
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });

usersCommand
  .command("get <id>")
  .description("Get user by ID")
  .action(async (id: string) => {
    if (!isAuthenticated()) {
      console.log("Not logged in. Run: mbe login");
      process.exit(1);
    }

    try {
      const response = await apiRequest<ApiResponse<User>>(`/api/v1/users/${id}`);
      const user = response.data;

      console.log("User");
      console.log("----");
      console.log(`ID:       ${user.id}`);
      console.log(`Email:    ${user.email}`);
      console.log(`Name:     ${user.name ?? "(not set)"}`);
      console.log(`Verified: ${user.emailVerified ? "Yes" : "No"}`);
      console.log(`Created:  ${user.createdAt}`);
      console.log(`Updated:  ${user.updatedAt}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });
