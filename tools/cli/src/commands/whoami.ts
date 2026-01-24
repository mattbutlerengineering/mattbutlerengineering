import { Command } from "commander";
import { isAuthenticated, getApiUrl } from "../config.js";
import { apiRequest } from "../api.js";
import type { ApiResponse, User } from "@mbe/types";

export const whoamiCommand = new Command("whoami")
  .description("Show current user info")
  .action(async () => {
    if (!isAuthenticated()) {
      console.log("Not logged in. Run: mbe login");
      process.exit(1);
    }

    try {
      const response = await apiRequest<ApiResponse<User>>("/api/v1/users/me");
      const user = response.data;

      console.log("User Info");
      console.log("---------");
      console.log(`ID:    ${user.id}`);
      console.log(`Email: ${user.email}`);
      console.log(`Name:  ${user.name ?? "(not set)"}`);
      console.log("");
      console.log(`API:   ${getApiUrl()}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });
