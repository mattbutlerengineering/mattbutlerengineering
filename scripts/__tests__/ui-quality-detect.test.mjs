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
