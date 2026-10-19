import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient } from "./client.js";
import { MenusClient } from "./menus.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const client = new MenusClient(new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 }));

const menu = {
  id: "m1",
  venueId: "v1",
  name: "Dinner",
  slug: "dinner",
  description: null,
  status: "DRAFT",
  displayOrder: 0,
  createdAt: "2026-10-18T00:00:00Z",
  updatedAt: "2026-10-18T00:00:00Z",
};
const section = { id: "s1", venueId: "v1", menuId: "m1", name: "Starters", displayOrder: 0 };
const item = {
  id: "i1",
  venueId: "v1",
  sectionId: "s1",
  name: "Soup",
  description: null,
  priceCents: 850,
  status: "AVAILABLE",
  displayOrder: 0,
};

/** The `[method, url]` of the most recent fetch call. */
function lastCall(): [string | undefined, string] {
  const [url, init] = mockFetch.mock.calls.at(-1) ?? [];
  return [init?.method, String(url)];
}

describe("MenusClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("calls the registered routes, venue-scoped through ?venueId=", async () => {
    const base = "https://api.test.com/api/v1/menus";
    const calls: [() => Promise<unknown>, unknown, string, string][] = [
      [() => client.list("v1"), { data: [menu] }, "GET", `${base}?venueId=v1`],
      [
        () => client.create("v1", { name: "Dinner", slug: "dinner" }),
        { data: menu },
        "POST",
        `${base}?venueId=v1`,
      ],
      [
        () => client.getById("v1", "m1"),
        { data: { ...menu, sections: [{ ...section, items: [item] }] } },
        "GET",
        `${base}/m1?venueId=v1`,
      ],
      [
        () => client.update("v1", "m1", { name: "x" }),
        { data: menu },
        "PATCH",
        `${base}/m1?venueId=v1`,
      ],
      [() => client.delete("v1", "m1"), null, "DELETE", `${base}/m1?venueId=v1`],
      [
        () => client.createSection("v1", "m1", { name: "Starters" }),
        { data: section },
        "POST",
        `${base}/m1/sections?venueId=v1`,
      ],
      [
        () => client.updateSection("v1", "m1", "s1", { name: "x" }),
        { data: section },
        "PATCH",
        `${base}/m1/sections/s1?venueId=v1`,
      ],
      [
        () => client.deleteSection("v1", "m1", "s1"),
        null,
        "DELETE",
        `${base}/m1/sections/s1?venueId=v1`,
      ],
      [
        () => client.reorderSections("v1", "m1", ["s1"]),
        { data: [section] },
        "PUT",
        `${base}/m1/sections/order?venueId=v1`,
      ],
      [
        () => client.createItem("v1", "m1", "s1", { name: "Soup", priceCents: 850 }),
        { data: item },
        "POST",
        `${base}/m1/sections/s1/items?venueId=v1`,
      ],
      [
        () => client.updateItem("v1", "m1", "s1", "i1", { name: "x" }),
        { data: item },
        "PATCH",
        `${base}/m1/sections/s1/items/i1?venueId=v1`,
      ],
      [
        () => client.deleteItem("v1", "m1", "s1", "i1"),
        null,
        "DELETE",
        `${base}/m1/sections/s1/items/i1?venueId=v1`,
      ],
      [
        () => client.reorderItems("v1", "m1", "s1", ["i1"]),
        { data: [item] },
        "PUT",
        `${base}/m1/sections/s1/items/order?venueId=v1`,
      ],
    ];

    for (const [call, body, method, url] of calls) {
      mockFetch.mockResolvedValueOnce(jsonResponse(body, body === null ? 204 : 200));
      await call();
      expect(lastCall()).toEqual([method, url]);
    }
  });

  it("sends the reorder ids as the body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [section] }));
    await client.reorderSections("v1", "m1", ["s2", "s1"]);
    expect(mockFetch.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ ids: ["s2", "s1"] }));
  });

  it("rejects a response that fails schema validation", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { ...menu, status: "PUBLISHED" } }));
    await expect(client.update("v1", "m1", { name: "x" })).rejects.toThrow();
  });

  it("encodes ids in the path and the venue in the query", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(null, 204));
    await client.delete("v 1", "m/1");
    expect(lastCall()[1]).toBe("https://api.test.com/api/v1/menus/m%2F1?venueId=v%201");
  });
});

describe("MenusClient public reads", () => {
  beforeEach(() => mockFetch.mockReset());

  it("listPublic GETs /public/v1/venues/:slug/menus and unwraps data", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [{ id: "m1", name: "Dinner", slug: "dinner", description: null, displayOrder: 0 }],
      })
    );

    const menus = await client.listPublic("the oak");

    expect(menus).toHaveLength(1);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.test.com/public/v1/venues/the%20oak/menus");
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("getPublic GETs one menu with sections, items and currency", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "m1",
          name: "Dinner",
          slug: "dinner",
          description: null,
          displayOrder: 0,
          currencyCode: "USD",
          sections: [
            {
              id: "s1",
              name: "Starters",
              displayOrder: 0,
              items: [
                {
                  id: "i1",
                  name: "Soup",
                  description: null,
                  priceCents: 850,
                  status: "SOLD_OUT",
                  displayOrder: 0,
                },
              ],
            },
          ],
        },
      })
    );

    const menu = await client.getPublic("the-oak", "dinner");

    expect(menu.currencyCode).toBe("USD");
    expect(menu.sections[0]!.items[0]!.status).toBe("SOLD_OUT");
    expect(String(mockFetch.mock.calls[0]![0])).toBe(
      "https://api.test.com/public/v1/venues/the-oak/menus/dinner"
    );
  });
});
