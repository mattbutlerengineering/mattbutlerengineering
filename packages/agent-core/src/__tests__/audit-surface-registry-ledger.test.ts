/**
 * SURFACE_REGISTRY ⊆ ui-quality ledger (docs/features/ui-quality-loop/
 * architecture.md § Components "SURFACE_REGISTRY subset guard").
 *
 * The committed ledger (`metrics/ui-quality-ledger.jsonl`, generated from the
 * three apps' routers) is the source of truth for route templates. Every
 * registry `page` surface whose URL path resolves into one of those three apps
 * must match a ledger row of that app, so the registry `/site-audit` spends
 * Lighthouse runs on can never name a page the source no longer has. The
 * registry is read, never changed; the ledger is read from disk (data, not an
 * import).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BASE_URL, SURFACE_REGISTRY } from "../audit-surface-registry.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const LEDGER = join(REPO, "metrics", "ui-quality-ledger.jsonl");

interface LedgerRow {
  readonly app: string;
  readonly route: string;
  readonly kind: string;
}

/**
 * The edge router's mounts (infrastructure/worker, as scripts/ui-quality/
 * edge-topology.mjs reads them), longest prefix first. `/gen` is a separately
 * deployed sibling app with no ledger rows, so its surfaces are out of scope.
 */
const MOUNTS: readonly { readonly prefix: string; readonly app: string | null }[] = [
  { prefix: "/hospitality", app: "hospitality" },
  { prefix: "/rialto", app: "rialto-web" },
  { prefix: "/gen", app: null },
  { prefix: "", app: "marketing" },
];

const segments = (path: string): string[] => path.split("/").filter((s) => s !== "");

/** The app serving a URL path and the router-relative route inside it. */
function resolveSurface(path: string): { app: string | null; route: string } {
  const mount = MOUNTS.find(
    (m) => m.prefix === "" || path === m.prefix || path.startsWith(`${m.prefix}/`)
  );
  if (mount === undefined) throw new Error(`no mount serves ${path}`);
  const rest = segments(path.slice(mount.prefix.length));
  return { app: mount.app, route: rest.length === 0 ? "/" : rest.join("/") };
}

/** `:param` matches one segment; a trailing `*` matches the rest. */
function matchesTemplate(route: string, template: string): boolean {
  const link = segments(route);
  const tmpl = segments(template);
  const splat = tmpl.at(-1) === "*";
  const fixed = splat ? tmpl.slice(0, -1) : tmpl;
  if (splat ? link.length < fixed.length : link.length !== fixed.length) return false;
  return fixed.every((seg, i) => seg.startsWith(":") || seg === link[i]);
}

const ledger: readonly LedgerRow[] = readFileSync(LEDGER, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line) as LedgerRow);

/** Rows a page can land on: never a redirect, never the bare catch-all. */
const templatesOf = (app: string): string[] =>
  ledger
    .filter((r) => r.app === app && r.kind !== "redirect" && r.route !== "*")
    .map((r) => r.route);

describe("SURFACE_REGISTRY ⊆ ui-quality ledger", () => {
  const inScope = SURFACE_REGISTRY.filter((s) => s.type === "page")
    .map((s) => ({ id: s.id, ...resolveSurface(s.url.slice(BASE_URL.length) || "/") }))
    .filter((s): s is { id: string; app: string; route: string } => s.app !== null);

  it("reads a ledger holding all three apps", () => {
    expect([...new Set(ledger.map((r) => r.app))].sort()).toEqual([
      "hospitality",
      "marketing",
      "rialto-web",
    ]);
    expect(inScope.length).toBeGreaterThan(0);
  });

  it("matches every in-scope page surface to a ledger row of the app that serves it", () => {
    const unmatched = inScope
      .filter((s) => !templatesOf(s.app).some((t) => matchesTemplate(s.route, t)))
      .map((s) => `${s.id} → ${s.app} ${s.route}`);
    expect(unmatched).toEqual([]);
  });

  it("resolves a path by the edge mounts and matches parameterised templates by segment", () => {
    expect(resolveSurface("/hospitality")).toEqual({ app: "hospitality", route: "/" });
    expect(resolveSurface("/rialto/components/button")).toEqual({
      app: "rialto-web",
      route: "components/button",
    });
    expect(resolveSurface("/gen")).toEqual({ app: null, route: "/" });
    expect(resolveSurface("/acmm")).toEqual({ app: "marketing", route: "acmm" });
    expect(matchesTemplate("floor-plans/abc", "floor-plans/:id")).toBe(true);
    expect(matchesTemplate("floor-plans", "floor-plans/:id")).toBe(false);
  });
});
