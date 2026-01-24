import { Command } from "commander";
import { clearTokens } from "../config.js";

export const logoutCommand = new Command("logout")
  .description("Clear stored credentials")
  .action(() => {
    clearTokens();
    console.log("Logged out successfully");
  });
