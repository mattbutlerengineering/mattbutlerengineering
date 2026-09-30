import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendManifestRow,
  capturePage,
  loadCapturePlan,
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
    async evaluate() {
      return script.probe ?? { hrefs: [], text_chars: 0, painted_ratio: 0 };
    },
    async screenshot(opts: { path: string }) {
      calls.push(`screenshot:${opts.path}`);
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
});
