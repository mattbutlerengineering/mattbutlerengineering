import { describe, it, expect } from "vitest";
import {
  AGENT_MERGED_QUERY,
  TOTAL_MERGED_QUERY,
  collectRepoStats,
  countTestFiles,
  createSearchPrCount,
  parseSearchCount,
} from "../collect-repo-stats.mjs";

/** Minimal deps that always succeed — individual tests override one key at a time. */
function fakeDeps(overrides = {}) {
  return {
    searchPrCount: async (query) => (query === AGENT_MERGED_QUERY ? 936 : 1426),
    listComponentDirs: () => ["Button", "Card", "Odometer"],
    listTrackedFiles: () => [
      "src/data/stats.ts",
      "src/data/stats.test.ts",
      "e2e/a11y.spec.ts",
      "README.md",
    ],
    now: () => new Date("2026-07-29T12:00:00.000Z"),
    ...overrides,
  };
}

describe("parseSearchCount", () => {
  it("extracts total_count from a well-formed search payload", () => {
    expect(parseSearchCount({ total_count: 1426 })).toBe(1426);
  });

  it("accepts zero", () => {
    expect(parseSearchCount({ total_count: 0 })).toBe(0);
  });

  it("throws when the payload is not an object", () => {
    expect(() => parseSearchCount(null)).toThrow(/total_count/);
    expect(() => parseSearchCount("1426")).toThrow(/total_count/);
  });

  it("throws when total_count is missing, negative, or not an integer", () => {
    expect(() => parseSearchCount({})).toThrow(/total_count/);
    expect(() => parseSearchCount({ total_count: -1 })).toThrow(/total_count/);
    expect(() => parseSearchCount({ total_count: 1.5 })).toThrow(/total_count/);
    expect(() => parseSearchCount({ total_count: "1426" })).toThrow(/total_count/);
  });
});

describe("countTestFiles", () => {
  it("counts tracked files matching the *.test.* / *.spec.* conventions", () => {
    expect(
      countTestFiles([
        "apps/marketing/src/data/stats.test.ts",
        "apps/marketing/e2e/a11y.spec.ts",
        "scripts/__tests__/regen.test.mjs",
        "packages/rialto/src/components/Button/Button.tsx",
      ])
    ).toBe(3);
  });

  it("ignores files that merely contain the word test in a path segment", () => {
    expect(countTestFiles(["docs/testing.md", "packages/latest/src/index.ts"])).toBe(0);
  });

  it("returns 0 for an empty tree", () => {
    expect(countTestFiles([])).toBe(0);
  });
});

describe("createSearchPrCount", () => {
  /** Records the request and replies with `total_count`. */
  function recordingFetch(calls, response) {
    return async (url, init) => {
      calls.push({ url, init });
      return response;
    };
  }

  const okResponse = {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ total_count: 1426 }),
  };

  it("asks the search API for a single page and returns total_count", async () => {
    const calls = [];
    const count = await createSearchPrCount(
      "t0ken",
      recordingFetch(calls, okResponse)
    )(TOTAL_MERGED_QUERY);

    expect(count).toBe(1426);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `https://api.github.com/search/issues?per_page=1&q=${encodeURIComponent(TOTAL_MERGED_QUERY)}`
    );
  });

  it("sends the token as a bearer credential and nowhere else", async () => {
    const calls = [];
    await createSearchPrCount("t0ken", recordingFetch(calls, okResponse))(AGENT_MERGED_QUERY);

    expect(calls[0].init.headers.authorization).toBe("Bearer t0ken");
    expect(calls[0].url).not.toContain("t0ken");
  });

  it("throws on a non-ok response without echoing the token", async () => {
    const forbidden = {
      ok: false,
      status: 403,
      statusText: "rate limit exceeded",
      json: async () => ({}),
    };
    const call = createSearchPrCount("t0ken", async () => forbidden)(TOTAL_MERGED_QUERY);

    await expect(call).rejects.toThrow("GitHub search failed: 403 rate limit exceeded");
    await expect(call).rejects.not.toThrow(/t0ken/);
  });

  it("rejects a malformed body rather than emitting a bogus count", async () => {
    const malformed = { ok: true, status: 200, statusText: "OK", json: async () => ({}) };

    await expect(
      createSearchPrCount("t0ken", async () => malformed)(TOTAL_MERGED_QUERY)
    ).rejects.toThrow(/total_count/);
  });
});

describe("collectRepoStats", () => {
  it("produces the proof-strip numbers from injected sources", async () => {
    const result = await collectRepoStats(fakeDeps());

    expect(result).toEqual({
      available: true,
      stats: {
        agentPrsMerged: 936,
        totalPrsMerged: 1426,
        rialtoComponents: 3,
        testFiles: 2,
        measuredAt: "2026-07-29T12:00:00.000Z",
      },
    });
  });

  it("emits exactly the documented schema keys", async () => {
    const result = await collectRepoStats(fakeDeps());

    expect(Object.keys(result.stats).sort()).toEqual([
      "agentPrsMerged",
      "measuredAt",
      "rialtoComponents",
      "testFiles",
      "totalPrsMerged",
    ]);
  });

  it("issues exactly two search calls — one per counter, no pagination", async () => {
    const queries = [];
    await collectRepoStats(
      fakeDeps({
        searchPrCount: async (query) => {
          queries.push(query);
          return 1;
        },
      })
    );

    expect(queries).toEqual([TOTAL_MERGED_QUERY, AGENT_MERGED_QUERY]);
  });

  it("scopes both queries to merged PRs in this repo", () => {
    expect(TOTAL_MERGED_QUERY).toContain("is:pr is:merged");
    expect(AGENT_MERGED_QUERY).toContain("is:pr is:merged");
    expect(AGENT_MERGED_QUERY).toContain("label:agent-authored");
  });

  it("reports unavailable instead of throwing when the GitHub call fails", async () => {
    const result = await collectRepoStats(
      fakeDeps({
        searchPrCount: async () => {
          throw new Error("getaddrinfo ENOTFOUND api.github.com");
        },
      })
    );

    expect(result.available).toBe(false);
    expect(result.stats).toBeUndefined();
    expect(result.reason).toContain("ENOTFOUND");
  });

  it("reports unavailable when a local source fails — never emits partial stats", async () => {
    const result = await collectRepoStats(
      fakeDeps({
        listTrackedFiles: () => {
          throw new Error("not a git repository");
        },
      })
    );

    expect(result.available).toBe(false);
    expect(result.stats).toBeUndefined();
  });
});
