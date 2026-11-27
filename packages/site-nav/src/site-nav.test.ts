import { describe, it, expect } from "vitest";
import {
  ENGINEERING_PAGES,
  engineeringMenu,
  globalNavProps,
  isEngineeringPageCurrent,
  siteCopyright,
  siteFooterColumns,
} from "./site-nav.js";

describe("globalNavProps", () => {
  it("returns the Engineering menu and the current path", () => {
    const props = globalNavProps("/shipped/story");
    expect(props.currentPath).toBe("/shipped/story");
    expect(props.menu).toEqual(engineeringMenu("/shipped/story"));
    expect(props.menu.label).toBe("Engineering");
  });

  it("passes labels through only when given", () => {
    expect("labels" in globalNavProps("/")).toBe(false);
    expect(globalNavProps("/", { gen: "Generar" }).labels).toEqual({ gen: "Generar" });
  });
});

describe("ENGINEERING_PAGES", () => {
  it("lists the five pages in the owner's order", () => {
    expect(ENGINEERING_PAGES.map((p) => p.label)).toEqual([
      "Metrics",
      "Shipped",
      "Status",
      "AI health",
      "ACMM",
    ]);
  });
});

describe("isEngineeringPageCurrent", () => {
  it("matches the page itself and its children, not a sibling with the same prefix", () => {
    expect(isEngineeringPageCurrent("/shipped", "/shipped")).toBe(true);
    expect(isEngineeringPageCurrent("/shipped/the-invitation", "/shipped")).toBe(true);
    expect(isEngineeringPageCurrent("/shipped-extra", "/shipped")).toBe(false);
    expect(isEngineeringPageCurrent("/status", "/shipped")).toBe(false);
    expect(isEngineeringPageCurrent("/metrics-old", "/metrics")).toBe(false);
    expect(isEngineeringPageCurrent("/", "/metrics")).toBe(false);
  });
});

describe("engineeringMenu", () => {
  it("lists every engineering page in order, and not Gen (a top-level GlobalNav item)", () => {
    const menu = engineeringMenu("/");
    expect(menu.label).toBe("Engineering");
    expect(menu.items.map((i) => i.label)).toEqual(ENGINEERING_PAGES.map((p) => p.label));
    expect(menu.items.some((i) => i.href === "/gen/")).toBe(false);
  });

  it("marks only the page the pathname is on as current", () => {
    const current = engineeringMenu("/shipped/some-story").items.filter((i) => i.current);
    expect(current.map((i) => i.href)).toEqual(["/shipped"]);
  });

  it("marks nothing current off the engineering pages, and never marks a page for /gen/", () => {
    expect(engineeringMenu("/gen/").items.some((i) => i.current)).toBe(false);
    expect(engineeringMenu("/").items.some((i) => i.current)).toBe(false);
  });
});

describe("siteFooterColumns", () => {
  it("has Projects (apps, then engineering pages) and Connect", () => {
    const [projects, connect] = siteFooterColumns();
    expect(projects?.title).toBe("Projects");
    expect(projects?.links.map((l) => l.href)).toEqual([
      "/rialto/",
      "/hospitality/",
      "/gen/",
      ...ENGINEERING_PAGES.map((p) => p.href),
    ]);
    expect(connect?.title).toBe("Connect");
    expect(connect?.links.map((l) => l.label)).toEqual(["GitHub", "LinkedIn", "Email"]);
  });

  it("returns fresh arrays so a caller cannot mutate the shared defaults", () => {
    const first = siteFooterColumns();
    first[0]?.links.pop();
    expect(siteFooterColumns()[0]?.links.length).toBe(3 + ENGINEERING_PAGES.length);
  });
});

describe("siteCopyright", () => {
  it("names the year", () => {
    expect(siteCopyright(2026)).toBe("© 2026 Matt Butler Engineering");
  });
});
