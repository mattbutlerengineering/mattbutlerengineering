import * as pulumi from "@pulumi/pulumi";
import { auth0Outputs } from "./auth0";

// Configuration
const config = new pulumi.Config();
const domain = config.require("domain");
const environment = config.get("environment") || "production";

// Auth0 exports
export const auth0ApiIdentifier = auth0Outputs.apiIdentifier;
export const auth0ClientId = auth0Outputs.dashboardClientId;

// Placeholder exports for when DigitalOcean/Cloudflare are configured
export const appUrl = pulumi.output("not-deployed-yet");
export const databaseHost = pulumi.output("not-deployed-yet");
