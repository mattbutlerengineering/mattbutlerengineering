import { describe, expect, it } from "vitest";
import type { Page, Route } from "@playwright/test";
import { PreviewResultSchema } from "@mbe/types";
import { mockAvailability } from "../availability-draft-mock.js";

/**
 * Drives `mockAvailability`'s `/availability/preview` route through a stand-in `Page`, the same
 * way `api-mocks-table-status.test.ts` drives `mockApi` — request-by-request, with no browser.
 *
 * Sentry issue #8280: the live guest preview (`AvailabilityGuestPreview`, rendered from
 * `AvailabilityDayEditor` whenever a day's draft is open) calls this endpoint for real. The route
 * answered a blind 500 with `detail: "Server said no."` — a literal string that exists nowhere
 * else in the codebase — so every day-draft e2e spec that opens the editor reported a genuine
 * `ApiClientError` to the app's Sentry client, read upstream as a production 500 from the
 * reservations service. There never was a reservations-service bug: the preview route
 * (`services/reservations/src/routes/availability-config.ts`) has no code path that produces
 * this text.
 */

type Handler = (route: Route) => Promise<void> | void;
interface Registered {
  readonly pattern: string;
  readonly handler: Handler;
}
interface Fulfilled {
  readonly status?: number;
  readonly body?: string;
}

function globToRegExp(glob: string): RegExp {
  const source = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*");
  return new RegExp(`^${source}$`);
}

async function postPreview(body: unknown): Promise<{ status: number; data: unknown }> {
  const registered: Registered[] = [];
  const page = {
    route: async (pattern: string, handler: Handler) => {
      registered.push({ pattern, handler });
    },
  } as unknown as Page;
  await mockAvailability(page);

  const url = "http://x/api/v1/venues/ven_e2e_001/availability/preview";
  // Playwright dispatches the last registered matching handler first.
  const entry = [...registered].reverse().find(({ pattern }) => globToRegExp(pattern).test(url));
  if (!entry) throw new Error("no preview route registered");

  const outcome: { fulfilled: Fulfilled | null } = { fulfilled: null };
  const route = {
    request: () => ({
      method: () => "POST",
      url: () => url,
      postDataJSON: () => body,
    }),
    fulfill: async (response: Fulfilled) => {
      outcome.fulfilled = response;
    },
  } as unknown as Route;
  await entry.handler(route);
  if (!outcome.fulfilled) throw new Error("preview route never fulfilled");
  return {
    status: outcome.fulfilled.status ?? 200,
    data: JSON.parse(outcome.fulfilled.body ?? "null"),
  };
}

const BODY = {
  draft: { changes: { upsert: {}, remove: {} }, scopeConflicts: "keep" },
  scope: { from: "2026-11-06" },
  focusDate: "2026-11-06",
  strandedOffset: 0,
  compareWith: "saved",
  partySize: 2,
};

describe("mockAvailability — POST .../availability/preview (#8280)", () => {
  it("answers a valid preview, not a blind 500", async () => {
    const { status, data } = await postPreview(BODY);
    expect(status).toBe(200);
    const result = PreviewResultSchema.safeParse((data as { data: unknown }).data);
    expect(result.success).toBe(true);
  });

  it("never answers the literal text Sentry saw from a real 500 (#8280)", async () => {
    const { data } = await postPreview(BODY);
    expect(JSON.stringify(data)).not.toContain("Server said no.");
  });
});
