import { describe, it, expect, vi } from "vitest";
import { fetchAllPages } from "./rest-paginate.js";
import type { RestContext } from "./rest-http.js";

function makeCtx(http: RestContext["http"]): RestContext {
  return { token: "t", owner: "o", repo: "r", http };
}

describe("fetchAllPages", () => {
  it("returns a single page when it satisfies the limit", () => {
    const http = vi
      .fn()
      .mockReturnValue({ status: 200, body: JSON.stringify([{ n: 1 }, { n: 2 }]) });
    const items = fetchAllPages(makeCtx(http), "/repos/o/r/issues?state=open", 5);
    expect(items).toEqual([{ n: 1 }, { n: 2 }]);
    expect(http).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0][0].url).toContain("state=open&per_page=5&page=1");
  });

  it("pages past the 100-per-page cap until `limit` items are collected", () => {
    const http = vi
      .fn()
      .mockReturnValueOnce({
        status: 200,
        body: JSON.stringify(Array.from({ length: 100 }, (_, i) => i)),
      })
      .mockReturnValueOnce({
        status: 200,
        body: JSON.stringify(Array.from({ length: 50 }, (_, i) => 100 + i)),
      });
    const items = fetchAllPages(makeCtx(http), "/repos/o/r/issues", 150, undefined);
    expect(items).toHaveLength(150);
    expect(http).toHaveBeenCalledTimes(2);
    expect(http.mock.calls[1][0].url).toContain("per_page=50&page=2");
  });

  it("unwraps an itemsKey envelope (Search API / Actions runs shape)", () => {
    const http = vi
      .fn()
      .mockReturnValue({ status: 200, body: JSON.stringify({ items: [{ n: 1 }] }) });
    const items = fetchAllPages(makeCtx(http), "/search/issues?q=x", 10, "items");
    expect(items).toEqual([{ n: 1 }]);
  });

  it("stops on an empty page instead of looping forever", () => {
    const http = vi.fn().mockReturnValue({ status: 200, body: JSON.stringify([]) });
    const items = fetchAllPages(makeCtx(http), "/repos/o/r/issues", 50);
    expect(items).toEqual([]);
    expect(http).toHaveBeenCalledTimes(1);
  });
});
