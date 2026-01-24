import { Command } from "commander";
import { setTokens, config } from "../config.js";

export const loginCommand = new Command("login")
  .description("Authenticate with the API")
  .option("--token <token>", "Access token (for testing)")
  .option("--api-url <url>", "API URL")
  .action(async (options) => {
    if (options.apiUrl) {
      config.set("apiUrl", options.apiUrl);
      console.log(`API URL set to: ${options.apiUrl}`);
    }

    if (options.token) {
      // Direct token input (for development/testing)
      setTokens(options.token, 3600); // 1 hour expiry
      console.log("Logged in successfully (token mode)");
      return;
    }

    // Device authorization flow would go here
    // For now, show instructions
    console.log("Device Authorization Flow");
    console.log("-------------------------");
    console.log("This feature requires Auth0 configuration.");
    console.log("");
    console.log("For development, use: mbe login --token <your-access-token>");
    console.log("");
    console.log("To get a token:");
    console.log("1. Sign in to the dashboard");
    console.log("2. Open browser DevTools > Application > Session Storage");
    console.log("3. Copy the access_token value");
  });
