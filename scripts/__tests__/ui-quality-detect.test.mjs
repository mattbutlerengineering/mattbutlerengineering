import { describe, it, expect, beforeEach } from "vitest";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main, matchesTemplate, mechanicalFindings } from "../ui-quality/detect.mjs";
import { judgedFindings } from "../ui-quality/detect-judged.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUBRIC = JSON.parse(readFileSync(join(REPO, "docs/ui-quality/rubric.json"), "utf8"));

const ledgerRow = (app, route, kind = "page") => ({
  route,
  app,
  kind,
  auth: "public",
  source_files: [],
  last_changed_at: null,
  last_audited_at: null,
  rubric_version: null,
  reachability: null,
});

const LEDGER = [
  ledgerRow("hospitality", "*", "not-found"),
  ledgerRow("hospitality", "/"),
  ledgerRow("hospitality", "book/:venueSlug"),
  ledgerRow("hospitality", "callback", "redirect"),
  ledgerRow("hospitality", "floor-plans"),
  ledgerRow("hospitality", "floor-plans/:id"),
  ledgerRow("marketing", "*", "not-found"),
  ledgerRow("marketing", "/"),
  ledgerRow("marketing", "hospitality/*", "redirect"),
  ledgerRow("rialto-web", "visual-test"),
];

const shot = (sha) => [
  { viewport: "1280x720", file: "a@1280x720.png", sha256: sha },
  { viewport: "375x812", file: "a@375x812.png", sha256: `${sha}-m` },
];

const row = (route, extra = {}) => ({
  route,
  path: route === "/" ? "/" : `/${route}`,
  screenshots: shot(`sha-${route}`),
  axe: { violations: [] },
  page_errors: [],
  console_errors: [],
  failed_requests: [],
  links: [],
  blank: { text_chars: 500, painted_ratio: 1 },
  ms: 10,
  ...extra,
});

const MANIFESTS = {
  hospitality: [
    row("book/:venueSlug", {
      links: ["/floor-plans/42", "/callback", "/nowhere", "/also-gone/x"],
      axe: {
        violations: [
          { id: "region", impact: "moderate", help: "h", nodes: [{ target: ["div.a"] }] },
          { id: "color-contrast", impact: "serious", help: "h", nodes: [{ target: ["p.b"] }] },
          { id: "button-name", impact: "critical", help: "h", nodes: [{ target: ["button"] }] },
        ],
      },
    }),
    row("/", {
      page_errors: ["TypeError: x is undefined"],
      failed_requests: [{ url: "http://localhost:4177/api/x", reason: "HTTP 500" }],
    }),
    row("floor-plans", { blank: { text_chars: 0, painted_ratio: 1 } }),
    row("*", { screenshots: [], error: "net::ERR_CONNECTION_REFUSED" }),
  ],
  marketing: [row("/", { links: ["/", "/hospitality", "/hospitality/timeline", "/gone"] })],
  "rialto-web": [row("visual-test", { page_errors: ["boom"] })],
};

const find = (findings, app, route, tell) =>
  findings.filter((f) => f.app === app && f.route === route && f.tell === tell);

describe("matchesTemplate", () => {
  it("matches parameterised and splat templates by segment, ignoring trailing slashes", () => {
    expect(matchesTemplate("/floor-plans/42", "floor-plans/:id")).toBe(true);
    expect(matchesTemplate("/floor-plans/42/edit", "floor-plans/:id")).toBe(false);
    expect(matchesTemplate("/hospitality/", "hospitality/*")).toBe(true);
    expect(matchesTemplate("/hospitality/timeline", "hospitality/*")).toBe(true);
    expect(matchesTemplate("/", "/")).toBe(true);
    expect(matchesTemplate("/x", "/")).toBe(false);
  });
});

describe("mechanicalFindings", () => {
  const findings = mechanicalFindings({ manifests: MANIFESTS, ledger: LEDGER, rubric: RUBRIC });

  it("files a dead in-app link: no template matches and it is not a redirect target; /floor-plans/42 matches floor-plans/:id", () => {
    const [dead] = find(findings, "hospitality", "book/:venueSlug", "bugs/dead-in-app-link");
    expect(dead.severity).toBe("P1");
    expect(dead.evidence.href).toBe("/nowhere");
    expect(dead.evidence.message).toMatch(/2 dead in-app links: \/nowhere, \/also-gone\/x/);
    expect(dead.evidence.message).not.toMatch(/floor-plans|callback/);
    expect(dead.evidence.screenshot_sha256).toBe("sha-book/:venueSlug");
  });

  it("never treats the catch-all `*` as a match, but does treat a redirect splat as one", () => {
    const [dead] = find(findings, "marketing", "/", "bugs/dead-in-app-link");
    expect(dead.evidence.message).toMatch(/1 dead in-app link: \/gone/);
  });

  it("maps axe impacts to accessibility/axe-<impact> with the rubric's severity: critical P1, serious P2", () => {
    const critical = find(findings, "hospitality", "book/:venueSlug", "accessibility/axe-critical");
    const serious = find(findings, "hospitality", "book/:venueSlug", "accessibility/axe-serious");
    const moderate = find(findings, "hospitality", "book/:venueSlug", "accessibility/axe-moderate");
    expect(critical.map((f) => f.severity)).toEqual(["P1"]);
    expect(serious.map((f) => f.severity)).toEqual(["P2"]);
    expect(moderate.map((f) => f.severity)).toEqual(["P2"]);
    expect(critical[0].evidence.selector).toBe("button");
    expect(critical[0].evidence.message).toMatch(/button-name/);
  });

  it("files unhandled errors (P1), failed requests (P2) and blank renders (P1)", () => {
    const [err] = find(findings, "hospitality", "/", "bugs/unhandled-error");
    expect(err.severity).toBe("P1");
    expect(err.evidence.message).toMatch(/TypeError: x is undefined/);
    const [req] = find(findings, "hospitality", "/", "bugs/failed-request");
    expect(req.severity).toBe("P2");
    expect(req.evidence.href).toBe("http://localhost:4177/api/x");
    const [blank] = find(findings, "hospitality", "floor-plans", "bugs/blank-render");
    expect(blank.severity).toBe("P1");
  });

  it("still yields bug findings on a harness route", () => {
    expect(find(findings, "rialto-web", "visual-test", "bugs/unhandled-error")).toHaveLength(1);
  });

  it("files nothing for a row that errored with no screenshots (the ledger's unreachable:build)", () => {
    expect(findings.filter((f) => f.route === "*" && f.app === "hospitality")).toEqual([]);
  });

  it("emits only mechanical tells the rubric knows, one per (app, route, tell), sorted", () => {
    const tells = new Map(RUBRIC.tells.map((t) => [t.id, t]));
    for (const f of findings) expect(tells.get(f.tell)?.detection).toBe("mechanical");
    const keys = findings.map((f) => `${f.app}|${f.route}|${f.tell}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(keys);
  });

  it("is the only P1 producer: every P1 is one of the rubric's mechanical P1 tells", () => {
    const p1 = new Set(RUBRIC.tells.filter((t) => t.default_severity === "P1").map((t) => t.id));
    for (const f of findings.filter((f) => f.severity === "P1")) expect(p1.has(f.tell)).toBe(true);
  });
});

describe("detect.mjs mechanical CLI", () => {
  let root;
  const out = [];
  const io = { stdout: (s) => out.push(s), stderr: (s) => out.push(s) };

  beforeEach(() => {
    out.length = 0;
    root = mkdtempSync(join(tmpdir(), "uiq-detect-"));
    mkdirSync(join(root, "metrics"));
    mkdirSync(join(root, "docs/ui-quality"), { recursive: true });
    copyFileSync(
      join(REPO, "docs/ui-quality/rubric.json"),
      join(root, "docs/ui-quality/rubric.json")
    );
    writeFileSync(
      join(root, "metrics/ui-quality-ledger.jsonl"),
      LEDGER.map((r) => JSON.stringify(r)).join("\n") + "\n"
    );
    for (const [app, rows] of Object.entries(MANIFESTS)) {
      mkdirSync(join(root, ".ui-quality/captures", app), { recursive: true });
      writeFileSync(
        join(root, ".ui-quality/captures", app, "manifest.jsonl"),
        rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
      );
    }
  });

  it("writes .ui-quality/findings.mechanical.json and exits 0", () => {
    expect(main(["mechanical", "--root", root], io)).toBe(0);
    const written = JSON.parse(
      readFileSync(join(root, ".ui-quality/findings.mechanical.json"), "utf8")
    );
    expect(written).toEqual(
      mechanicalFindings({ manifests: MANIFESTS, ledger: LEDGER, rubric: RUBRIC })
    );
  });

  it("exits 2 on a missing rubric, writing nothing", () => {
    writeFileSync(join(root, "docs/ui-quality/rubric.json"), "");
    expect(main(["mechanical", "--root", root], io)).toBe(2);
    expect(existsSync(join(root, ".ui-quality/findings.mechanical.json"))).toBe(false);
  });

  it("exits 2 when there is no capture manifest at all", () => {
    const empty = mkdtempSync(join(tmpdir(), "uiq-detect-empty-"));
    mkdirSync(join(empty, "metrics"));
    mkdirSync(join(empty, "docs/ui-quality"), { recursive: true });
    copyFileSync(
      join(REPO, "docs/ui-quality/rubric.json"),
      join(empty, "docs/ui-quality/rubric.json")
    );
    writeFileSync(join(empty, "metrics/ui-quality-ledger.jsonl"), "");
    expect(main(["mechanical", "--root", empty], io)).toBe(2);
  });

  it("exits 2 on an unreadable manifest line", () => {
    writeFileSync(join(root, ".ui-quality/captures/marketing/manifest.jsonl"), "{not json\n");
    expect(main(["mechanical", "--root", root], io)).toBe(2);
  });

  it("bare detect.mjs prints usage naming mechanical and judged and exits 2", () => {
    expect(main([], io)).toBe(2);
    expect(out.join("")).toMatch(/mechanical\|judged/);
  });
});

// ---------------------------------------------------------------------------
// detect.mjs judged
// ---------------------------------------------------------------------------

describe("judgedFindings", () => {
  // marketing: three judgeable routes; hospitality: two judgeable + one errored no-screenshot row.
  const manifests = {
    marketing: [row("/"), row("acmm"), row("status")],
    hospitality: [
      row("book/:venueSlug"),
      row("reservations/manage"),
      row("*", { screenshots: [], error: "x" }),
    ],
  };
  const judged = {
    marketing: {
      app: "marketing",
      rubric_version: 1,
      model_id: "claude-opus-5",
      routes: [
        {
          route: "/",
          tells: [
            {
              tell: "agent-built/gradient-background",
              evidence: "purple hero gradient",
              severity: "P1",
            },
            { tell: "agent-built/made-up-tell", evidence: "x", severity: "P2" },
            { tell: "bugs/blank-render", evidence: "looks blank", severity: "P1" },
          ],
        },
        { route: "acmm", unjudged: "tool-error" },
        { route: "status", tells: "not-an-array" },
        { route: "no-such-route", tells: [] },
      ],
    },
    hospitality: {
      app: "hospitality",
      rubric_version: 1,
      model_id: "claude-opus-5",
      routes: [{ route: "book/:venueSlug", tells: [] }],
    },
  };
  const logs = [];
  const { findings, status } = judgedFindings({
    manifests,
    judged,
    rubric: RUBRIC,
    log: (l) => logs.push(l),
  });

  it("files a valid judged tell with the rubric's default severity, even when the model wrote P1", () => {
    expect(findings).toEqual([
      {
        app: "marketing",
        route: "/",
        tell: "agent-built/gradient-background",
        severity: "P2",
        evidence: {
          message: "purple hero gradient",
          screenshot_sha256: "sha-/",
          screenshot_sha256s: ["sha-/", "sha-/-m"],
        },
      },
    ]);
  });

  it("drops an unknown tell and a mechanical-detection tell, logs each once, lists them, and keeps the route judged", () => {
    expect(status.routes.marketing["/"]).toBe("judged");
    expect(status.dropped).toEqual(
      expect.arrayContaining([
        { app: "marketing", route: "/", tell: "agent-built/made-up-tell", reason: "unknown-tell" },
        { app: "marketing", route: "/", tell: "bugs/blank-render", reason: "not-judged-detection" },
      ])
    );
    expect(logs.filter((l) => l.includes("agent-built/made-up-tell"))).toHaveLength(1);
    expect(logs.filter((l) => l.includes("bugs/blank-render"))).toHaveLength(1);
  });

  it("drops an entry for a route the manifest lacks", () => {
    expect(status.dropped).toContainEqual({
      app: "marketing",
      route: "no-such-route",
      tell: null,
      reason: "unknown-route",
    });
    expect(status.routes.marketing["no-such-route"]).toBeUndefined();
  });

  it("maps unjudged, schema-failing and omitted routes to unjudged:<reason>", () => {
    expect(status.routes.marketing.acmm).toBe("unjudged:tool-error");
    expect(status.routes.marketing.status).toBe("unjudged:malformed");
    expect(status.routes.hospitality["reservations/manage"]).toBe("unjudged:missing");
  });

  it("treats `tells: []` as judged clean, and leaves the errored no-screenshot row out of routes", () => {
    expect(status.routes.hospitality["book/:venueSlug"]).toBe("judged");
    expect(Object.keys(status.routes.hospitality)).not.toContain("*");
  });

  it("marks every judgeable route of an app malformed on a wrong rubric_version or an unparseable file", () => {
    const wrongVersion = judgedFindings({
      manifests,
      judged: { ...judged, marketing: { ...judged.marketing, rubric_version: 2 } },
      rubric: RUBRIC,
      log: () => {},
    });
    expect(wrongVersion.status.routes.marketing).toEqual({
      "/": "unjudged:malformed",
      acmm: "unjudged:malformed",
      status: "unjudged:malformed",
    });
    expect(wrongVersion.findings.filter((f) => f.app === "marketing")).toEqual([]);
    const unparseable = judgedFindings({
      manifests,
      judged: { ...judged, hospitality: "{not json" },
      rubric: RUBRIC,
      log: () => {},
    });
    expect(unparseable.status.routes.hospitality).toEqual({
      "book/:venueSlug": "unjudged:malformed",
      "reservations/manage": "unjudged:malformed",
    });
  });

  it("an app with no judged file has every judgeable route unjudged:missing", () => {
    const none = judgedFindings({ manifests, judged: {}, rubric: RUBRIC, log: () => {} });
    expect(none.status.routes.hospitality).toEqual({
      "book/:venueSlug": "unjudged:missing",
      "reservations/manage": "unjudged:missing",
    });
  });

  it("never emits a judged finding whose severity is not its tell's default (SC-2)", () => {
    const tells = new Map(RUBRIC.tells.map((t) => [t.id, t]));
    for (const f of findings) {
      expect(tells.get(f.tell).detection).toBe("judged");
      expect(f.severity).toBe(tells.get(f.tell).default_severity);
    }
  });
});

describe("detect.mjs judged CLI + the ledger.mjs record round-trip", () => {
  let root;
  const io = { stdout: () => {}, stderr: () => {} };
  const writeJsonl = (path, rows) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "uiq-judged-"));
    mkdirSync(join(root, "metrics"));
    mkdirSync(join(root, "docs/ui-quality"), { recursive: true });
    copyFileSync(
      join(REPO, "docs/ui-quality/rubric.json"),
      join(root, "docs/ui-quality/rubric.json")
    );
    writeJsonl(join(root, "metrics/ui-quality-ledger.jsonl"), [
      ledgerRow("marketing", "/"),
      ledgerRow("marketing", "acmm"),
      ledgerRow("marketing", "metrics"),
      ledgerRow("marketing", "status"),
    ]);
    writeFileSync(join(root, "metrics/ui-quality-runs.jsonl"), "");
    writeJsonl(join(root, ".ui-quality/captures/marketing/manifest.jsonl"), [
      row("/"),
      row("acmm"),
      row("metrics", { screenshots: [], error: "timeout" }),
      row("status"),
    ]);
    writeFileSync(
      join(root, ".ui-quality/due.json"),
      JSON.stringify({
        at: "2026-10-01T07:30:00Z",
        git_depth: "full",
        rubric_version: 1,
        due: ["/", "acmm", "metrics", "status"].map((route) => ({
          app: "marketing",
          route,
          path: route === "/" ? "/" : `/${route}`,
        })),
        unreachable_auth: [],
      })
    );
    mkdirSync(join(root, ".ui-quality/judged"), { recursive: true });
    writeFileSync(
      join(root, ".ui-quality/judged/marketing.json"),
      JSON.stringify({
        app: "marketing",
        rubric_version: 1,
        model_id: "claude-opus-5",
        routes: [
          {
            route: "/",
            tells: [
              { tell: "agent-built/icon-card-grid", evidence: "icon cards", severity: "P2" },
              { tell: "agent-built/nope", evidence: "x", severity: "P2" },
            ],
          },
          { route: "acmm", unjudged: "tool-error" },
        ],
      })
    );
  });

  it("writes findings.judged.json + judge-status.json, and ledger.mjs record turns them into exactly the implied rows and counts", async () => {
    expect(main(["judged", "--root", root], io)).toBe(0);
    const findings = JSON.parse(
      readFileSync(join(root, ".ui-quality/findings.judged.json"), "utf8")
    );
    expect(findings.map((f) => f.tell)).toEqual(["agent-built/icon-card-grid"]);
    const status = JSON.parse(readFileSync(join(root, ".ui-quality/judge-status.json"), "utf8"));
    expect(status.routes.marketing).toEqual({
      "/": "judged",
      acmm: "unjudged:tool-error",
      status: "unjudged:missing",
    });

    const { main: ledgerMain } = await import("../ui-quality/ledger.mjs");
    const now = "2026-10-01T08:00:00Z";
    expect(ledgerMain(["record", "--root", root], { now: () => now, ...io })).toBe(0);
    const rows = readFileSync(join(root, "metrics/ui-quality-ledger.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const by = Object.fromEntries(rows.map((r) => [r.route, r]));
    expect(by["/"]).toMatchObject({
      reachability: "audited",
      last_audited_at: now,
      rubric_version: 1,
    });
    expect(by.acmm).toMatchObject({ reachability: "unjudged:tool-error", last_audited_at: null });
    expect(by.status).toMatchObject({ reachability: "unjudged:missing", last_audited_at: null });
    expect(by.metrics).toMatchObject({ reachability: "unreachable:build" });
    const [run] = readFileSync(join(root, "metrics/ui-quality-runs.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(run).toMatchObject({
      due: 4,
      audited: 1,
      unjudged: 2,
      dropped_tells: 1,
      unreachable: { auth: 0, build: 1 },
    });
  });

  it("exits 0 with every route unjudged:malformed on an unparseable judged file", () => {
    writeFileSync(join(root, ".ui-quality/judged/marketing.json"), "{nope");
    expect(main(["judged", "--root", root], io)).toBe(0);
    const status = JSON.parse(readFileSync(join(root, ".ui-quality/judge-status.json"), "utf8"));
    expect(Object.values(status.routes.marketing)).toEqual([
      "unjudged:malformed",
      "unjudged:malformed",
      "unjudged:malformed",
    ]);
  });

  it("exits 2 on a missing rubric or a missing manifest", () => {
    writeFileSync(join(root, "docs/ui-quality/rubric.json"), "");
    expect(main(["judged", "--root", root], io)).toBe(2);
    const bare = mkdtempSync(join(tmpdir(), "uiq-judged-bare-"));
    mkdirSync(join(bare, "docs/ui-quality"), { recursive: true });
    copyFileSync(
      join(REPO, "docs/ui-quality/rubric.json"),
      join(bare, "docs/ui-quality/rubric.json")
    );
    expect(main(["judged", "--root", bare], io)).toBe(2);
  });
});
