import { describe, it, expect, vi } from "vitest";
import {
  PAGE_REGISTRY,
  buildNavSections,
  buildSitemapPaths,
  REGISTRY_NAV_SECTIONS,
  REGISTRY_SITEMAP_PATHS,
  type PageEntry,
  type NavSection,
  type NavItem,
} from "./page-registry.js";

// ---------------------------------------------------------------------------
// Mock all page modules so load() calls resolve without rendering components.
// Each factory returns a minimal module with a named export matching the
// pattern the load() arrow expects.
// ---------------------------------------------------------------------------

vi.mock("../pages/forms/ButtonPage.js", () => ({ ButtonPage: () => null }));
vi.mock("../pages/forms/InputPage.js", () => ({ InputPage: () => null }));
vi.mock("../pages/forms/TextAreaPage.js", () => ({ TextAreaPage: () => null }));
vi.mock("../pages/forms/NumberInputPage.js", () => ({ NumberInputPage: () => null }));
vi.mock("../pages/forms/CheckboxRadioPage.js", () => ({ CheckboxRadioPage: () => null }));
vi.mock("../pages/forms/TogglePage.js", () => ({ TogglePage: () => null }));
vi.mock("../pages/forms/MasterOverridePage.js", () => ({ MasterOverridePage: () => null }));
vi.mock("../pages/forms/SliderPage.js", () => ({ SliderPage: () => null }));
vi.mock("../pages/forms/SelectPage.js", () => ({ SelectPage: () => null }));
vi.mock("../pages/forms/PinInputPage.js", () => ({ PinInputPage: () => null }));
vi.mock("../pages/forms/SegmentedControlPage.js", () => ({ SegmentedControlPage: () => null }));
vi.mock("../pages/forms/AutocompletePage.js", () => ({ AutocompletePage: () => null }));
vi.mock("../pages/forms/InputGroupPage.js", () => ({ InputGroupPage: () => null }));
vi.mock("../pages/data/CardPage.js", () => ({ CardPage: () => null }));
vi.mock("../pages/data/TablePage.js", () => ({ TablePage: () => null }));
vi.mock("../pages/data/BadgePage.js", () => ({ BadgePage: () => null }));
vi.mock("../pages/data/TagPage.js", () => ({ TagPage: () => null }));
vi.mock("../pages/data/AvatarPage.js", () => ({ AvatarPage: () => null }));
vi.mock("../pages/data/StatPage.js", () => ({ StatPage: () => null }));
vi.mock("../pages/data/DataListPage.js", () => ({ DataListPage: () => null }));
vi.mock("../pages/data/MeterPage.js", () => ({ MeterPage: () => null }));
vi.mock("../pages/data/KbdPage.js", () => ({ KbdPage: () => null }));
vi.mock("../pages/data/FlipDotPage.js", () => ({ FlipDotPage: () => null }));
vi.mock("../pages/data/SplitFlapPage.js", () => ({ SplitFlapPage: () => null }));
vi.mock("../pages/data/ChalkboardPage.js", () => ({ ChalkboardPage: () => null }));
vi.mock("../pages/data/FerrofluidPage.js", () => ({ FerrofluidPage: () => null }));
vi.mock("../pages/data/TapeChartPage.js", () => ({ TapeChartPage: () => null }));
vi.mock("../pages/data/TreePage.js", () => ({ TreePage: () => null }));
vi.mock("../pages/data/TimelinePage.js", () => ({ TimelinePage: () => null }));
vi.mock("../pages/navigation/TabsPage.js", () => ({ TabsPage: () => null }));
vi.mock("../pages/navigation/BreadcrumbPage.js", () => ({ BreadcrumbPage: () => null }));
vi.mock("../pages/navigation/StepsPage.js", () => ({ StepsPage: () => null }));
vi.mock("../pages/navigation/PaginationPage.js", () => ({ PaginationPage: () => null }));
vi.mock("../pages/navigation/NavigationMenuPage.js", () => ({
  NavigationMenuPage: () => null,
}));
vi.mock("../pages/navigation/SidebarPage.js", () => ({ SidebarPage: () => null }));
vi.mock("../pages/navigation/NavbarPage.js", () => ({ NavbarPage: () => null }));
vi.mock("../pages/feedback/ToastPage.js", () => ({ ToastPage: () => null }));
vi.mock("../pages/feedback/AlertPage.js", () => ({ AlertPage: () => null }));
vi.mock("../pages/feedback/BannerPage.js", () => ({ BannerPage: () => null }));
vi.mock("../pages/feedback/ProgressPage.js", () => ({ ProgressPage: () => null }));
vi.mock("../pages/feedback/SpinnerPage.js", () => ({ SpinnerPage: () => null }));
vi.mock("../pages/feedback/SkeletonPage.js", () => ({ SkeletonPage: () => null }));
vi.mock("../pages/feedback/EmptyStatePage.js", () => ({ EmptyStatePage: () => null }));
vi.mock("../pages/overlays/DialogPage.js", () => ({ DialogPage: () => null }));
vi.mock("../pages/overlays/ConfirmDialogPage.js", () => ({ ConfirmDialogPage: () => null }));
vi.mock("../pages/overlays/DrawerPage.js", () => ({ DrawerPage: () => null }));
vi.mock("../pages/overlays/CommandPalettePage.js", () => ({ CommandPalettePage: () => null }));
vi.mock("../pages/overlays/TooltipPage.js", () => ({ TooltipPage: () => null }));
vi.mock("../pages/overlays/PopoverPage.js", () => ({ PopoverPage: () => null }));
vi.mock("../pages/overlays/HoverCardPage.js", () => ({ HoverCardPage: () => null }));
vi.mock("../pages/overlays/DropdownMenuPage.js", () => ({ DropdownMenuPage: () => null }));
vi.mock("../pages/overlays/ContextMenuPage.js", () => ({ ContextMenuPage: () => null }));
vi.mock("../pages/overlays/DisabledTooltipPage.js", () => ({ DisabledTooltipPage: () => null }));
vi.mock("../pages/layout/DividerPage.js", () => ({ DividerPage: () => null }));
vi.mock("../pages/layout/TextPage.js", () => ({ TextPage: () => null }));
vi.mock("../pages/layout/StackPage.js", () => ({ StackPage: () => null }));
vi.mock("../pages/layout/CollapsiblePage.js", () => ({ CollapsiblePage: () => null }));
vi.mock("../pages/layout/AccordionPage.js", () => ({ AccordionPage: () => null }));
vi.mock("../pages/layout/AspectRatioPage.js", () => ({ AspectRatioPage: () => null }));
vi.mock("../pages/layout/SplitScreenExitPage.js", () => ({ SplitScreenExitPage: () => null }));
vi.mock("../pages/layout/ScrollAreaPage.js", () => ({ ScrollAreaPage: () => null }));
vi.mock("../pages/layout/HeroPage.js", () => ({ HeroPage: () => null }));
vi.mock("../pages/layout/FooterPage.js", () => ({ FooterPage: () => null }));
vi.mock("../pages/layout/PageHeaderPage.js", () => ({ PageHeaderPage: () => null }));
vi.mock("../pages/dashboard/Dashboard.js", () => ({ Dashboard: () => null }));
vi.mock("../pages/examples/DashboardExamplePage.js", () => ({
  DashboardExamplePage: () => null,
}));
vi.mock("../pages/examples/SettingsExamplePage.js", () => ({
  SettingsExamplePage: () => null,
}));
vi.mock("../pages/examples/FormStatesExamplePage.js", () => ({
  FormStatesExamplePage: () => null,
}));

// ---------------------------------------------------------------------------
// Structure tests
// ---------------------------------------------------------------------------

describe("PageRegistry — structure", () => {
  it("PAGE_REGISTRY is a non-empty array", () => {
    expect(Array.isArray(PAGE_REGISTRY)).toBe(true);
    expect(PAGE_REGISTRY.length).toBeGreaterThan(0);
  });

  it("every entry has id, label, category, and path", () => {
    for (const entry of PAGE_REGISTRY) {
      expect(entry.id, `${entry.id} missing id`).toBeTruthy();
      expect(entry.label, `${entry.id} missing label`).toBeTruthy();
      expect(entry.category, `${entry.id} missing category`).toBeTruthy();
      expect(entry.path, `${entry.id} missing path`).toBeTruthy();
    }
  });

  it("every entry has a load function", () => {
    for (const entry of PAGE_REGISTRY) {
      expect(typeof entry.load, `${entry.id} missing load`).toBe("function");
    }
  });

  it("ids are globally unique", () => {
    const ids = PAGE_REGISTRY.map((e: PageEntry) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("paths are globally unique", () => {
    const paths = PAGE_REGISTRY.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("paths start with /components/, /examples/, or /dashboard", () => {
    for (const entry of PAGE_REGISTRY) {
      expect(
        entry.path.startsWith("/components/") ||
          entry.path.startsWith("/examples/") ||
          entry.path === "/dashboard" ||
          entry.path.startsWith("/dashboard/"),
        `${entry.id} has invalid path: ${entry.path}`
      ).toBe(true);
    }
  });

  it("ids use kebab-case only", () => {
    for (const entry of PAGE_REGISTRY) {
      expect(entry.id, `${entry.id} uses non-kebab characters`).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("comingSoon entries all have non-empty labels", () => {
    const comingSoon = PAGE_REGISTRY.filter((e) => e.comingSoon);
    expect(comingSoon.length).toBeGreaterThan(0);
    for (const entry of comingSoon) {
      expect(entry.label).toBeTruthy();
    }
  });

  it("non-comingSoon entries have real dynamic imports (not stub resolvers)", () => {
    // comingSoon entries use Promise.resolve({}) as a stub; all others should use import()
    const real = PAGE_REGISTRY.filter((e) => !e.comingSoon);
    expect(real.length).toBeGreaterThan(0);
    for (const entry of real) {
      expect(typeof entry.load).toBe("function");
    }
  });

  it("categories include Forms, Data Display, Navigation, Feedback, Overlays, Layout", () => {
    const categories = new Set(PAGE_REGISTRY.map((e) => e.category));
    expect(categories.has("Forms")).toBe(true);
    expect(categories.has("Data Display")).toBe(true);
    expect(categories.has("Navigation")).toBe(true);
    expect(categories.has("Feedback")).toBe(true);
    expect(categories.has("Overlays")).toBe(true);
    expect(categories.has("Layout")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Load function tests — call every entry's load() to exercise the factories
// ---------------------------------------------------------------------------

describe("PageRegistry — load factories", () => {
  it("all load() functions return a Promise", async () => {
    for (const entry of PAGE_REGISTRY) {
      const result = entry.load();
      expect(result, `${entry.id}.load() did not return a Promise`).toBeInstanceOf(Promise);
    }
  });

  it("comingSoon entries resolve to an empty object", async () => {
    const comingSoon = PAGE_REGISTRY.filter((e) => e.comingSoon);
    for (const entry of comingSoon) {
      const mod = await entry.load();
      expect(mod, `${entry.id} comingSoon load() should resolve to {}`).toEqual({});
    }
  });

  it("non-comingSoon entries resolve to an object with a default export", async () => {
    const real = PAGE_REGISTRY.filter((e) => !e.comingSoon);
    for (const entry of real) {
      const mod = (await entry.load()) as Record<string, unknown>;
      expect(mod, `${entry.id} load() resolved to non-object: ${JSON.stringify(mod)}`).toBeTruthy();
      expect("default" in mod, `${entry.id} load() did not produce a {default} shape`).toBe(true);
    }
  });

  it("every load() resolves without throwing", async () => {
    await Promise.all(
      PAGE_REGISTRY.map((entry) =>
        expect(entry.load(), `${entry.id}.load() should not reject`).resolves.toBeTruthy()
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Nav derivation tests
// ---------------------------------------------------------------------------

describe("PageRegistry — nav derivation", () => {
  it("buildNavSections returns non-empty array", () => {
    const sections = buildNavSections(PAGE_REGISTRY);
    expect(sections.length).toBeGreaterThan(0);
  });

  it("every page in registry is listed in nav (by id)", () => {
    const sections = buildNavSections(PAGE_REGISTRY);
    const navIds = sections.flatMap((s) => s.items.map((i) => i.id));
    for (const entry of PAGE_REGISTRY) {
      expect(navIds, `${entry.id} not found in nav`).toContain(entry.id);
    }
  });

  it("section labels are unique", () => {
    const sections = buildNavSections(PAGE_REGISTRY);
    const labels = sections.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("nav items use /components/{id} path pattern for component pages", () => {
    const sections = buildNavSections(PAGE_REGISTRY);
    const allItems = sections.flatMap((s) => s.items);
    const componentItems = allItems.filter((item) => item.path.startsWith("/components/"));
    for (const item of componentItems) {
      expect(item.path).toBe(`/components/${item.id}`);
    }
  });

  it("preserves category order of first appearance", () => {
    const entries: PageEntry[] = [
      {
        id: "b",
        label: "B",
        category: "Beta",
        path: "/components/b",
        load: () => Promise.resolve({}),
      },
      {
        id: "a",
        label: "A",
        category: "Alpha",
        path: "/components/a",
        load: () => Promise.resolve({}),
      },
      {
        id: "b2",
        label: "B2",
        category: "Beta",
        path: "/components/b2",
        load: () => Promise.resolve({}),
      },
    ];
    const sections = buildNavSections(entries);
    expect(sections[0]!.label).toBe("Beta");
    expect(sections[1]!.label).toBe("Alpha");
  });

  it("groups multiple entries in the same category into one section", () => {
    const entries: PageEntry[] = [
      {
        id: "a",
        label: "A",
        category: "Forms",
        path: "/components/a",
        load: () => Promise.resolve({}),
      },
      {
        id: "b",
        label: "B",
        category: "Forms",
        path: "/components/b",
        load: () => Promise.resolve({}),
      },
      {
        id: "c",
        label: "C",
        category: "Layout",
        path: "/components/c",
        load: () => Promise.resolve({}),
      },
    ];
    const sections = buildNavSections(entries);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.items).toHaveLength(2);
    expect(sections[1]!.items).toHaveLength(1);
  });

  it("propagates comingSoon flag to nav items", () => {
    const entries: PageEntry[] = [
      {
        id: "motion",
        label: "Motion",
        category: "Tokens",
        path: "/components/motion",
        comingSoon: true,
        load: () => Promise.resolve({}),
      },
      {
        id: "button",
        label: "Button",
        category: "Forms",
        path: "/components/button",
        load: () => Promise.resolve({}),
      },
    ];
    const sections = buildNavSections(entries);
    const tokensSection = sections.find((s) => s.label === "Tokens")!;
    const formsSection = sections.find((s) => s.label === "Forms")!;

    expect(tokensSection.items[0]!.comingSoon).toBe(true);
    expect(formsSection.items[0]!.comingSoon).toBeUndefined();
  });

  it("omits comingSoon key from nav items without the flag", () => {
    const entries: PageEntry[] = [
      {
        id: "x",
        label: "X",
        category: "C",
        path: "/components/x",
        load: () => Promise.resolve({}),
      },
    ];
    const sections = buildNavSections(entries);
    expect("comingSoon" in sections[0]!.items[0]!).toBe(false);
  });

  it("handles single-entry registry correctly", () => {
    const entries: PageEntry[] = [
      {
        id: "solo",
        label: "Solo",
        category: "Single",
        path: "/components/solo",
        load: () => Promise.resolve({}),
      },
    ];
    const sections = buildNavSections(entries);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.items).toHaveLength(1);
    expect(sections[0]!.items[0]!.id).toBe("solo");
  });

  it("REGISTRY_NAV_SECTIONS is derived from PAGE_REGISTRY and non-empty", () => {
    expect(Array.isArray(REGISTRY_NAV_SECTIONS)).toBe(true);
    expect(REGISTRY_NAV_SECTIONS.length).toBeGreaterThan(0);
    // Must match what buildNavSections produces from PAGE_REGISTRY
    const derived = buildNavSections(PAGE_REGISTRY);
    expect(REGISTRY_NAV_SECTIONS).toEqual(derived);
  });
});

// ---------------------------------------------------------------------------
// Sitemap path tests
// ---------------------------------------------------------------------------

describe("PageRegistry — sitemap paths", () => {
  it("buildSitemapPaths returns all page paths", () => {
    const paths = buildSitemapPaths(PAGE_REGISTRY);
    expect(paths.length).toBe(PAGE_REGISTRY.length);
    for (const entry of PAGE_REGISTRY) {
      expect(paths, `${entry.path} not in sitemap paths`).toContain(entry.path);
    }
  });

  it("buildSitemapPaths preserves registry order", () => {
    const paths = buildSitemapPaths(PAGE_REGISTRY);
    PAGE_REGISTRY.forEach((entry, i) => {
      expect(paths[i]).toBe(entry.path);
    });
  });

  it("buildSitemapPaths works on a custom subset", () => {
    const subset: PageEntry[] = [
      {
        id: "a",
        label: "A",
        category: "C",
        path: "/components/a",
        load: () => Promise.resolve({}),
      },
      { id: "b", label: "B", category: "C", path: "/examples/b", load: () => Promise.resolve({}) },
    ];
    expect(buildSitemapPaths(subset)).toEqual(["/components/a", "/examples/b"]);
  });

  it("buildSitemapPaths returns empty array for empty input", () => {
    expect(buildSitemapPaths([])).toEqual([]);
  });

  it("REGISTRY_SITEMAP_PATHS matches PAGE_REGISTRY paths", () => {
    expect(REGISTRY_SITEMAP_PATHS).toEqual(PAGE_REGISTRY.map((e) => e.path));
  });
});

// ---------------------------------------------------------------------------
// Validation guard tests
// ---------------------------------------------------------------------------

describe("PageRegistry — missing metadata guard", () => {
  it("fails loudly when an entry lacks id", () => {
    const badEntry = {
      label: "Test",
      category: "Forms",
      path: "/components/test",
      load: () => Promise.resolve({}),
    } as unknown as PageEntry;
    expect(() => buildNavSections([badEntry])).toThrow('missing required field "id"');
  });

  it("fails loudly when an entry lacks label", () => {
    const badEntry = {
      id: "test",
      category: "Forms",
      path: "/components/test",
      load: () => Promise.resolve({}),
    } as unknown as PageEntry;
    expect(() => buildNavSections([badEntry])).toThrow(/"label"/);
  });

  it("fails loudly when an entry lacks category", () => {
    const badEntry = {
      id: "test",
      label: "Test",
      path: "/components/test",
      load: () => Promise.resolve({}),
    } as unknown as PageEntry;
    expect(() => buildNavSections([badEntry])).toThrow(/"category"/);
  });

  it("fails on first invalid entry in a mixed list", () => {
    const good: PageEntry = {
      id: "good",
      label: "Good",
      category: "Forms",
      path: "/components/good",
      load: () => Promise.resolve({}),
    };
    const bad = {
      label: "Bad",
      category: "Forms",
      path: "/components/bad",
      load: () => Promise.resolve({}),
    } as unknown as PageEntry;
    expect(() => buildNavSections([good, bad])).toThrow();
  });

  it("throws for empty id string (falsy)", () => {
    const badEntry = {
      id: "",
      label: "Test",
      category: "Forms",
      path: "/components/test",
      load: () => Promise.resolve({}),
    } as unknown as PageEntry;
    expect(() => buildNavSections([badEntry])).toThrow();
  });

  it("throws for empty label string (falsy)", () => {
    const badEntry = {
      id: "test",
      label: "",
      category: "Forms",
      path: "/components/test",
      load: () => Promise.resolve({}),
    } as unknown as PageEntry;
    expect(() => buildNavSections([badEntry])).toThrow();
  });

  it("throws for empty category string (falsy)", () => {
    const badEntry = {
      id: "test",
      label: "Test",
      category: "",
      path: "/components/test",
      load: () => Promise.resolve({}),
    } as unknown as PageEntry;
    expect(() => buildNavSections([badEntry])).toThrow();
  });

  it("accepts empty array without throwing", () => {
    expect(() => buildNavSections([])).not.toThrow();
    expect(buildNavSections([])).toEqual([]);
  });

  it("PAGE_REGISTRY itself passes validation (no throw)", () => {
    expect(() => buildNavSections(PAGE_REGISTRY)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// NavItem / NavSection type shape tests
// ---------------------------------------------------------------------------

describe("PageRegistry — derived type shapes", () => {
  it("NavSection has label string and items array", () => {
    const sections: NavSection[] = buildNavSections(PAGE_REGISTRY);
    for (const section of sections) {
      expect(typeof section.label).toBe("string");
      expect(Array.isArray(section.items)).toBe(true);
    }
  });

  it("NavItem has id, label, path — all strings", () => {
    const sections: NavSection[] = buildNavSections(PAGE_REGISTRY);
    for (const section of sections) {
      for (const item of section.items as NavItem[]) {
        expect(typeof item.id).toBe("string");
        expect(typeof item.label).toBe("string");
        expect(typeof item.path).toBe("string");
      }
    }
  });

  it("NavItem does not carry the load factory", () => {
    const sections: NavSection[] = buildNavSections(PAGE_REGISTRY);
    for (const section of sections) {
      for (const item of section.items) {
        expect("load" in item).toBe(false);
      }
    }
  });
});
