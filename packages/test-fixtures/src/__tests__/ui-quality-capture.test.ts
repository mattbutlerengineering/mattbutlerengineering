import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendManifestRow,
  capturePage,
  HIDDEN_SCRIPT,
  REVEAL_SCRIPT,
  SETTLED_SCRIPT,
  loadCapturePlan,
  revealLazyContent,
  resetManifest,
  sameOriginLinks,
  screenshotName,
  type CapturePageLike,
} from "../ui-quality-capture.js";

const ORIGIN = "http://127.0.0.1:4173";
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
];

type Handler = (arg: unknown) => void;

/** A fake Playwright page: records calls, replays scripted events on goto. */
function fakePage(
  script: {
    gotoError?: Error;
    foldError?: Error;
    revealError?: Error;
    events?: Array<[string, unknown]>;
    probe?: { hrefs: string[]; text_chars: number; painted_ratio: number };
  } = {}
) {
  const handlers = new Map<string, Handler[]>();
  const calls: string[] = [];
  const page: CapturePageLike = {
    on(event: string, handler: Handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    off(event: string, handler: Handler) {
      handlers.set(
        event,
        (handlers.get(event) ?? []).filter((h) => h !== handler)
      );
    },
    async emulateMedia(opts: { reducedMotion: string }) {
      calls.push(`emulateMedia:${opts.reducedMotion}`);
    },
    async setViewportSize(v: { width: number; height: number }) {
      calls.push(`viewport:${v.width}x${v.height}`);
    },
    async goto(url: string) {
      calls.push(`goto:${url}`);
      for (const [event, arg] of script.events ?? []) {
        for (const h of handlers.get(event) ?? []) h(arg);
      }
      if (script.gotoError) throw script.gotoError;
      return null;
    },
    async waitForLoadState() {},
    async evaluate(fn: unknown) {
      if (fn === REVEAL_SCRIPT) {
        calls.push("reveal");
        if (script.revealError) throw script.revealError;
        return undefined;
      }
      return script.probe ?? { hrefs: [], text_chars: 0, painted_ratio: 0 };
    },
    async screenshot(opts: { path: string; fullPage?: boolean }) {
      calls.push(`screenshot:${opts.path}`);
      if (opts.fullPage === false && script.foldError) throw script.foldError;
      const bytes = Buffer.from(`png:${opts.path}`);
      writeFileSync(opts.path, bytes); // Playwright writes `path` and returns the bytes
      return bytes;
    },
  };
  return { page, calls };
}

const axeResult = {
  violations: [
    {
      id: "image-alt",
      impact: "critical",
      help: "Images must have alternate text",
      nodes: [{ target: ["img.hero"], html: "<img class=hero>" }],
    },
  ],
};

const opts = (outDir: string) => ({
  baseUrl: ORIGIN,
  path: "/book/e2e-test-bistro",
  outDir,
  viewports: VIEWPORTS,
  analyzeAxe: async () => axeResult,
});

describe("capturePage", () => {
  it("screenshots each viewport with a sha256 and returns the manifest row", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "uiq-capture-"));
    const { page, calls } = fakePage({
      events: [
        ["pageerror", new Error("boom")],
        ["console", { type: () => "error", text: () => "console boom" }],
        ["console", { type: () => "log", text: () => "fine" }],
        [
          "requestfailed",
          { url: () => `${ORIGIN}/api/x`, failure: () => ({ errorText: "net::ERR_FAILED" }) },
        ],
        ["requestfailed", { url: () => "https://cdn.example.com/a.js", failure: () => null }],
        ["response", { url: () => `${ORIGIN}/api/y`, status: () => 500 }],
        ["response", { url: () => `${ORIGIN}/ok`, status: () => 200 }],
      ],
      probe: {
        hrefs: [`${ORIGIN}/reservations/manage`, "https://example.com/", `${ORIGIN}/`],
        text_chars: 412,
        painted_ratio: 0.73,
      },
    });

    const row = await capturePage(page, "book/:venueSlug", opts(outDir));

    expect(calls[0]).toBe("emulateMedia:reduce");
    expect(row.route).toBe("book/:venueSlug");
    expect(row.path).toBe("/book/e2e-test-bistro");
    expect(row.error).toBeUndefined();
    expect(row.screenshots).toHaveLength(2);
    for (const shot of row.screenshots) {
      const bytes = readFileSync(join(outDir, shot.file));
      expect(shot.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
    expect(row.screenshots.map((s) => s.viewport)).toEqual(["1280x720", "375x812"]);
    expect(row.axe.violations).toEqual([
      {
        id: "image-alt",
        impact: "critical",
        help: "Images must have alternate text",
        nodes: [{ target: ["img.hero"] }],
      },
    ]);
    expect(row.page_errors).toEqual(["boom"]);
    expect(row.console_errors).toEqual(["console boom"]);
    expect(row.failed_requests).toEqual([
      { url: `${ORIGIN}/api/x`, reason: "net::ERR_FAILED" },
      { url: `${ORIGIN}/api/y`, reason: "HTTP 500" },
    ]);
    expect(row.links).toEqual(["/", "/reservations/manage"]);
    expect(row.blank).toEqual({ text_chars: 412, painted_ratio: 0.73 });
    expect(typeof row.ms).toBe("number");
  });

  it("returns a row carrying `error` — never throws — when the route fails to load", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "uiq-capture-"));
    const { page, calls } = fakePage({ gotoError: new Error("net::ERR_CONNECTION_REFUSED") });

    const row = await capturePage(page, "/", { ...opts(outDir), path: "/" });

    expect(row.error).toBe("net::ERR_CONNECTION_REFUSED");
    expect(row.screenshots).toEqual([]);
    expect(row.route).toBe("/");
    expect(calls.some((c) => c.startsWith("screenshot:"))).toBe(false);
  });

  it("records an axe failure as `error` rather than throwing", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "uiq-capture-"));
    const { page } = fakePage();
    const row = await capturePage(page, "/", {
      ...opts(outDir),
      analyzeAxe: async () => {
        throw new Error("axe exploded");
      },
    });
    expect(row.error).toBe("axe exploded");
  });
});

describe("capturePage fold", () => {
  it("takes one viewport-only 1280×720 shot after the full pages and records it as `fold`", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "uiq-capture-"));
    const { page, calls } = fakePage();
    const shots: Array<{ path: string; fullPage?: boolean; at: string }> = [];
    let viewport = "";
    const setViewportSize = page.setViewportSize.bind(page);
    const screenshot = page.screenshot.bind(page);
    page.setViewportSize = async (v) => {
      viewport = `${v.width}x${v.height}`;
      return setViewportSize(v);
    };
    page.screenshot = (async (o: { path: string; fullPage?: boolean }) => {
      shots.push({ path: o.path, fullPage: o.fullPage, at: viewport });
      return screenshot(o);
    }) as CapturePageLike["screenshot"];

    const row = await capturePage(page, "book/:venueSlug", opts(outDir));

    expect(shots.map((s) => [s.fullPage, s.at])).toEqual([
      [true, "1280x720"],
      [true, "375x812"],
      [false, "1280x720"],
    ]);
    expect(shots[2].path).toBe(join(outDir, "book-venueSlug@1280x720.fold.png"));
    expect(row.screenshots).toHaveLength(2);
    expect(row.fold).toEqual({
      viewport: "1280x720",
      file: "book-venueSlug@1280x720.fold.png",
      sha256: createHash("sha256")
        .update(readFileSync(join(outDir, "book-venueSlug@1280x720.fold.png")))
        .digest("hex"),
    });
    expect(row.error).toBeUndefined();
    expect(calls.filter((c) => c.startsWith("screenshot:"))).toHaveLength(3);
  });

  it("a fold failure leaves `fold` absent and `error` unset — the row is simply not taste-eligible", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "uiq-capture-"));
    const { page } = fakePage({ foldError: new Error("fold exploded") });
    const row = await capturePage(page, "/", { ...opts(outDir), path: "/" });
    expect(row.fold).toBeUndefined();
    expect(row.error).toBeUndefined();
    expect(row.screenshots).toHaveLength(2);
  });

  it("takes no fold when the route itself failed to load", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "uiq-capture-"));
    const { page } = fakePage({ gotoError: new Error("net::ERR_CONNECTION_REFUSED") });
    const row = await capturePage(page, "/", { ...opts(outDir), path: "/" });
    expect(row.fold).toBeUndefined();
    expect(row.error).toBe("net::ERR_CONNECTION_REFUSED");
  });
});

// ui-quality-loop review M2: sections that reveal on scroll (rialto's
// useScrollReveal) stay at opacity 0 below the fold, and a fullPage screenshot
// never scrolls — so the judge and the VR floor both saw empty sections.
describe("capturePage reveals scroll-triggered content", () => {
  it("scrolls the page through once before the first screenshot", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "uiq-reveal-"));
    const { page, calls } = fakePage();
    const row = await capturePage(page, "/", opts(outDir));
    expect(row.error).toBeUndefined();
    const reveal = calls.indexOf("reveal");
    const firstShot = calls.findIndex((c) => c.startsWith("screenshot:"));
    expect(reveal).toBeGreaterThan(-1);
    expect(reveal).toBeLessThan(firstShot);
  });

  it("a reveal failure is not a row failure — the row still gets its screenshots", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "uiq-reveal-"));
    const { page, calls } = fakePage({ revealError: new Error("scroll failed") });
    const row = await capturePage(page, "/", opts(outDir));
    expect(row.error).toBeUndefined();
    expect(calls.filter((c) => c.startsWith("screenshot:")).length).toBeGreaterThan(0);
  });
});

// ui-quality-loop re-review N5: marketing's `html { scroll-behavior: smooth }`
// turned every `scrollTo` into an animation, so the reveal returned while the
// page was still scrolling back (measured: scrollY 224 on /status) and the
// shot landed at a run-dependent offset — noise on routes with nothing to
// reveal at all.
describe("revealLazyContent settles the page before returning (re-review N5)", () => {
  /** A page whose evaluate answers each script from `answers`, recording the order. */
  function scriptedPage(answers: Map<string, unknown[]>) {
    const calls: string[] = [];
    const name = (fn: unknown) =>
      fn === HIDDEN_SCRIPT
        ? "hidden"
        : fn === REVEAL_SCRIPT
          ? "reveal"
          : fn === SETTLED_SCRIPT
            ? "settled"
            : "frames";
    return {
      calls,
      page: {
        async evaluate(fn: unknown) {
          const n = name(fn);
          calls.push(n);
          const queue = answers.get(n) ?? [];
          return queue.length > 1 ? queue.shift() : queue[0];
        },
      } as unknown as Parameters<typeof revealLazyContent>[0],
    };
  }

  it("scrolls instantly, never through the page's smooth scroll-behavior", () => {
    expect(REVEAL_SCRIPT).toMatch(/behavior: "instant"/);
    expect(REVEAL_SCRIPT).not.toMatch(/scrollTo\(0, /);
  });

  it("counts the page settled only at the top, with no running animation and fonts loaded", () => {
    expect(SETTLED_SCRIPT).toMatch(/window\.scrollY === 0/);
    expect(SETTLED_SCRIPT).toMatch(/document\.getAnimations\(\)\.length === 0/);
    expect(SETTLED_SCRIPT).toMatch(/document\.fonts\.status === "loaded"/);
  });

  it("does not scroll a page with nothing hidden, but still settles it", async () => {
    const { page, calls } = scriptedPage(
      new Map<string, unknown[]>([
        ["hidden", [false]],
        ["settled", [true]],
      ])
    );
    await revealLazyContent(page);
    expect(calls).not.toContain("reveal");
    expect(calls).toEqual(["hidden", "settled", "frames"]);
  });

  it("with hidden content it scrolls, polls until settled, then waits two frames", async () => {
    const { page, calls } = scriptedPage(
      new Map<string, unknown[]>([
        ["hidden", [true]],
        ["settled", [false, false, true]],
      ])
    );
    await revealLazyContent(page);
    expect(calls).toEqual(["hidden", "reveal", "settled", "settled", "settled", "frames"]);
  });
});

describe("sameOriginLinks", () => {
  it("keeps same-origin paths, drops external hrefs, fragments and non-http schemes, dedupes and sorts", () => {
    expect(
      sameOriginLinks(
        [
          `${ORIGIN}/b`,
          `${ORIGIN}/a?x=1`,
          `${ORIGIN}/b#top`,
          "https://github.com/x",
          "mailto:hi@example.com",
          "not a url",
        ],
        `${ORIGIN}/`
      )
    ).toEqual(["/a", "/b"]);
  });
});

describe("capturePage under an app base path", () => {
  it("joins the app-relative plan path onto the base and reports links app-relative", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "uiq-capture-"));
    const { page, calls } = fakePage({
      probe: {
        hrefs: [`${ORIGIN}/rialto/components/button`, `${ORIGIN}/`, `${ORIGIN}/rialto/`],
        text_chars: 10,
        painted_ratio: 0.5,
      },
    });
    const row = await capturePage(page, "components/button", {
      ...opts(outDir),
      baseUrl: `${ORIGIN}/rialto/`,
      path: "/components/button",
    });
    expect(calls).toContain(`goto:${ORIGIN}/rialto/components/button`);
    expect(row.links).toEqual(["/", "/components/button"]);
  });
});

describe("loadCapturePlan + resetManifest + appendManifestRow", () => {
  it("reads the app's entries from UI_QUALITY_PLAN and puts captures beside it; only resetManifest truncates", () => {
    const work = mkdtempSync(join(tmpdir(), "uiq-plan-"));
    const planPath = join(work, "plan.json");
    const entry = { route: "/", path: "/", viewports: VIEWPORTS };
    writeFileSync(planPath, JSON.stringify({ marketing: [entry] }));
    mkdirSync(join(work, "captures", "marketing"), { recursive: true });
    writeFileSync(join(work, "captures", "marketing", "manifest.jsonl"), "stale\n");

    const plan = loadCapturePlan("marketing", { UI_QUALITY_PLAN: planPath });
    expect(plan.entries).toEqual([entry]);
    expect(plan.outDir).toBe(join(work, "captures", "marketing"));
    expect(readFileSync(plan.manifestPath, "utf8")).toBe("stale\n");

    resetManifest(plan, 1); // a restarted worker: rows already written must survive
    expect(readFileSync(plan.manifestPath, "utf8")).toBe("stale\n");
    resetManifest(plan, 0); // the run's first worker starts the manifest
    expect(readFileSync(plan.manifestPath, "utf8")).toBe("");

    appendManifestRow(plan, { route: "/" } as never);
    appendManifestRow(plan, { route: "acmm" } as never);
    expect(readFileSync(plan.manifestPath, "utf8")).toBe('{"route":"/"}\n{"route":"acmm"}\n');
  });

  it("has no entries — and writes nothing — for an app absent from the plan or with no UI_QUALITY_PLAN", () => {
    const work = mkdtempSync(join(tmpdir(), "uiq-plan-"));
    const planPath = join(work, "plan.json");
    writeFileSync(planPath, JSON.stringify({ marketing: [] }));
    expect(loadCapturePlan("hospitality", { UI_QUALITY_PLAN: planPath }).entries).toEqual([]);
    expect(loadCapturePlan("marketing", {}).entries).toEqual([]);
  });
});

describe("screenshotName", () => {
  it("is a filesystem-safe slug of the route plus the viewport", () => {
    expect(screenshotName("book/:venueSlug", { width: 1280, height: 720 })).toBe(
      "book-venueSlug@1280x720.png"
    );
    expect(screenshotName("/", { width: 375, height: 812 })).toBe("root@375x812.png");
    expect(screenshotName("*", { width: 375, height: 812 })).toBe("not-found@375x812.png");
  });

  it("trims leading and trailing separators", () => {
    expect(screenshotName("/reservations/:id/", { width: 375, height: 812 })).toBe(
      "reservations-id@375x812.png"
    );
  });

  it("stays linear on long separator runs (CodeQL js/polynomial-redos)", () => {
    const route = `a${"-".repeat(100_000)}b${"/".repeat(100_000)}`;
    const started = performance.now();
    expect(screenshotName(route, { width: 375, height: 812 })).toBe("a-b@375x812.png");
    expect(performance.now() - started).toBeLessThan(500);
  });
});
