import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient } from "./client.js";
import { FloorPlanSectionsClient } from "./floor-plan-sections.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const client = new FloorPlanSectionsClient(
  new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 })
);

const section = {
  id: "s1",
  venueId: "v1",
  floorPlanId: "f1",
  name: "Patio",
  color: "#3366cc",
  displayOrder: 0,
  createdAt: "2026-10-22T00:00:00Z",
  updatedAt: "2026-10-22T00:00:00Z",
};

function lastCall(): [string | undefined, string] {
  const [url, init] = mockFetch.mock.calls.at(-1) ?? [];
  return [init?.method, String(url)];
}

describe("FloorPlanSectionsClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("calls the registered routes, venue-scoped through ?venueId=", async () => {
    const base = "https://api.test.com/api/v1/floor-plan-sections";
    const calls: [() => Promise<unknown>, unknown, string, string][] = [
      [() => client.list("v1"), { data: [section] }, "GET", `${base}?venueId=v1`],
      [
        () => client.list("v1", "f1"),
        { data: [section] },
        "GET",
        `${base}?venueId=v1&floorPlanId=f1`,
      ],
      [
        () => client.create("v1", { floorPlanId: "f1", name: "Patio" }),
        { data: section },
        "POST",
        `${base}?venueId=v1`,
      ],
      [
        () => client.update("v1", "s1", { name: "Bar" }),
        { data: section },
        "PATCH",
        `${base}/s1?venueId=v1`,
      ],
      [() => client.delete("v1", "s1"), null, "DELETE", `${base}/s1?venueId=v1`],
      [
        () => client.reorder("v1", "f1", ["s1"]),
        { data: [section] },
        "PUT",
        `${base}/order?venueId=v1`,
      ],
      [
        () => client.assignTables("v1", "s1", []),
        { data: [] },
        "PUT",
        `${base}/s1/tables?venueId=v1`,
      ],
    ];
    for (const [call, body, method, url] of calls) {
      mockFetch.mockResolvedValueOnce(jsonResponse(body, body === null ? 204 : 200));
      await call();
      expect(lastCall()).toEqual([method, url]);
    }
  });
});
