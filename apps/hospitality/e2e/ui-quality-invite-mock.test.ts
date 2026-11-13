import { describe, it, expect, vi } from "vitest";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mockPublicInvite } from "./api-mocks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// #8763: the ui-quality capture of /i/:token hit a 502 from the unmocked invite API.
describe("mockPublicInvite", () => {
  it("serves a 200 invite body for the invite read URL", async () => {
    let matcher: RegExp | undefined;
    let handler: ((route: unknown) => unknown) | undefined;
    const page = {
      route: vi.fn(async (m: RegExp, h: (route: unknown) => unknown) => {
        matcher = m;
        handler = h;
      }),
    } as unknown as Page;
    await mockPublicInvite(page);
    expect(matcher?.test("http://localhost:4177/public/v1/invites/ui-quality-invite")).toBe(true);
    const fulfill = vi.fn();
    await handler?.({ fulfill });
    const arg = fulfill.mock.calls[0]?.[0] as { status: number; body: string };
    expect(arg.status).toBe(200);
    const body = JSON.parse(arg.body).data as { venue: { name: string }; status: string };
    expect(body.venue.name).toBeTruthy();
    expect(body.status).toBe("CONFIRMED");
  });

  it("is installed by the ui-quality capture spec", () => {
    const src = readFileSync(resolve(__dirname, "ui-quality.capture.ts"), "utf8");
    expect(src).toContain("mockPublicInvite(page)");
  });
});
