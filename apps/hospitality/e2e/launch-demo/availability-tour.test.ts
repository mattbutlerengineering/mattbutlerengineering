import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { nextChristmasEve } from "../helpers/demo-venue.js";
import {
  DEMO_AUTH_ENV,
  DEMO_HUB_URL,
  demoSessionEntry,
  typedChristmasEve,
} from "./availability-tour.js";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("the demo dev server", () => {
  const pkg = JSON.parse(readFileSync(resolve(appDir, "package.json"), "utf-8")) as {
    scripts: Record<string, string>;
  };
  const serve = pkg.scripts["demo:serve"] ?? "";

  it("is built with the same authority and client the stand-in session is keyed by", () => {
    for (const [name, value] of Object.entries(DEMO_AUTH_ENV)) {
      expect(serve).toContain(`${name}=${value}`);
    }
  });

  it("serves the API origin and port the tour's hub address points at", () => {
    const { origin, port } = new URL(DEMO_HUB_URL);
    expect(serve).toContain(`VITE_API_URL=${origin}`);
    expect(serve).toContain(`--port ${port} --strictPort`);
  });
});

describe("typedChristmasEve", () => {
  it("is the demo venue's special date as a manager types it", () => {
    const iso = nextChristmasEve();
    expect(typedChristmasEve()).toBe(`12/24/${iso.slice(0, 4)}`);
  });
});

describe("demoSessionEntry", () => {
  it("is keyed the way oidc-client-ts reads a user for the demo dev server's authority and client", () => {
    const { key } = demoSessionEntry(0);
    expect(key).toBe(
      `oidc.user:${DEMO_AUTH_ENV.VITE_AUTH_AUTHORITY}:${DEMO_AUTH_ENV.VITE_AUTH_CLIENT_ID}`
    );
  });

  it("points at a reserved .invalid authority, so a stand-in session can never reach a real tenant", () => {
    expect(new URL(DEMO_AUTH_ENV.VITE_AUTH_AUTHORITY).hostname.endsWith(".invalid")).toBe(true);
  });

  it("stays signed in for the whole recording: expiry is hours after now, in seconds", () => {
    const nowMs = 1_800_000_000_000;
    const user = JSON.parse(demoSessionEntry(nowMs).value) as { expires_at: number };
    expect(user.expires_at - nowMs / 1000).toBeGreaterThanOrEqual(4 * 60 * 60);
  });

  it("carries no real credential: the tokens are fixed placeholders", () => {
    const user = JSON.parse(demoSessionEntry(0).value) as {
      access_token: string;
      id_token: string;
    };
    expect(user.access_token).toBe("launch-demo-access-token");
    expect(user.id_token).toBe("launch-demo-id-token");
  });
});
