// @vitest-environment node
/**
 * Unit tests for the canonical component-metadata introspection module.
 *
 * These run against the REAL component set so they catch any drift between
 * the introspection model and the actual Rialto barrel exports.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  introspectComponents,
  characterLimits,
  assertCharacterLimitsResolve,
  type ComponentMetadata,
} from "./component-metadata.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RIALTO_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// characterLimits (moved to canonical location)
// ---------------------------------------------------------------------------

describe("characterLimits", () => {
  it("contains Badge children limit of 20", () => {
    const limit = characterLimits.find((l) => l.component === "Badge" && l.prop === "children");
    expect(limit).toBeDefined();
    expect(limit!.max).toBe(20);
  });

  it("contains Button children limit of 30", () => {
    const limit = characterLimits.find((l) => l.component === "Button" && l.prop === "children");
    expect(limit).toBeDefined();
    expect(limit!.max).toBe(30);
  });

  it("has reason on every entry", () => {
    for (const entry of characterLimits) {
      expect(typeof entry.reason).toBe("string");
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// introspectComponents — model shape
// ---------------------------------------------------------------------------

describe("introspectComponents", () => {
  let components: ComponentMetadata[];

  // Lazy-initialise once per test suite (the TS program is expensive).
  function getComponents(): ComponentMetadata[] {
    if (!components) {
      components = introspectComponents(RIALTO_ROOT);
    }
    return components;
  }

  it("returns the same component count as registry.json", () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(RIALTO_ROOT, "registry.json"), "utf-8")
    ) as { components: { name: string }[] };
    const result = getComponents();
    expect(result).toHaveLength(registry.components.length);
  });

  it("every component has a name and importPath", () => {
    for (const comp of getComponents()) {
      expect(typeof comp.name).toBe("string");
      expect(comp.name.length).toBeGreaterThan(0);
      expect(comp.importPath).toBe("@mattbutlerengineering/rialto");
    }
  });

  it("components are sorted by name (byte-order, not localeCompare)", () => {
    const names = getComponents().map((c) => c.name);
    // introspectComponents uses a byte-order comparator (not localeCompare) so
    // that the sort is identical on macOS and Linux CI — see #2195→#2217.
    const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(names).toEqual(sorted);
  });

  it("Button exists with expected shape", () => {
    const button = getComponents().find((c) => c.name === "Button");
    expect(button).toBeDefined();

    // Button children is a slot
    expect(button!.slots).toContain("children");

    // Button has character limit on children (from characterLimits.ts)
    const limit = button!.characterLimits.find((l) => l.prop === "children");
    expect(limit).toBeDefined();
    expect(limit!.max).toBe(30);
    expect(typeof limit!.reason).toBe("string");

    // Button has a variant prop
    const variantProp = button!.props.find((p) => p.name === "variant");
    expect(variantProp).toBeDefined();
    expect(variantProp!.required).toBe(false);
    // type and resolvedType are non-empty strings
    expect(variantProp!.type.length).toBeGreaterThan(0);
    expect(variantProp!.resolvedType.length).toBeGreaterThan(0);
  });

  it("Alert has description from JSDoc", () => {
    const alert = getComponents().find((c) => c.name === "Alert");
    expect(alert).toBeDefined();
    expect(typeof alert!.description).toBe("string");
    expect(alert!.description!.length).toBeGreaterThan(0);
  });

  it("props include declaredInRialto flag", () => {
    // Button variant is declared in the rialto src, not inherited from HTML
    const button = getComponents().find((c) => c.name === "Button");
    const variantProp = button!.props.find((p) => p.name === "variant");
    expect(variantProp!.declaredInRialto).toBe(true);
  });

  it("every characterLimitInfo has prop and max; reason is optional (catalog limits omit it)", () => {
    for (const comp of getComponents()) {
      for (const cl of comp.characterLimits) {
        expect(typeof cl.prop).toBe("string");
        expect(typeof cl.max).toBe("number");
        expect(cl.max).toBeGreaterThan(0);
        if (cl.reason !== undefined) {
          expect(typeof cl.reason).toBe("string");
          expect(cl.reason.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("enum values in resolvedType are byte-sorted (not localeCompare, not program-order)", () => {
    // Stack.direction is a known multi-value enum whose order was non-deterministic
    // before this fix (reordered when component count changed from 26→135).
    // Byte comparator: (a,b)=>(a<b?-1:a>b?1:0) — matches the component-name sort.
    const stack = getComponents().find((c) => c.name === "Stack");
    expect(stack).toBeDefined();

    const direction = stack!.props.find((p) => p.name === "direction");
    expect(direction).toBeDefined();

    // resolvedType for an optional "column" | "row" prop contains the quoted
    // string literals plus "undefined". Strip undefined and check byte order.
    const members = direction!.resolvedType
      .split(" | ")
      .map((m) => m.trim())
      .filter((m) => m !== "undefined");

    const byteComparator = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
    const sorted = [...members].sort(byteComparator);
    expect(members).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// assertCharacterLimitsResolve — one-vocabulary drift guard (issue #3352)
//
// Every character limit (catalog `charLimits` OR the static residue) must name
// a real prop/slot of its component. This is the single check that catches the
// EmptyState `title`→`heading` class of drift: a limit for a prop that the
// component does not have used to ship silently into manifest/registry.
// ---------------------------------------------------------------------------

describe("assertCharacterLimitsResolve", () => {
  it("passes for the real, merged component model (no limit references a missing prop)", () => {
    // introspectComponents() already runs the assertion; call it directly too so
    // a regression names the offending limit rather than failing setup opaquely.
    const components = introspectComponents(RIALTO_ROOT);
    expect(() => assertCharacterLimitsResolve(components)).not.toThrow();
  });

  it("throws, naming the offender, when a limit references a nonexistent prop", () => {
    const bogus: ComponentMetadata = {
      name: "EmptyState",
      exportIdentifier: "EmptyState",
      importPath: "@mattbutlerengineering/rialto",
      subpath: "EmptyState",
      props: [{ name: "heading", type: "string", resolvedType: "string", required: false, declaredInRialto: true }],
      slots: ["children"],
      // `title` is not a real prop of EmptyState — the exact historical drift.
      characterLimits: [{ prop: "title", max: 50 }],
    };
    expect(() => assertCharacterLimitsResolve([bogus])).toThrow(/EmptyState\.title/);
  });

  it("accepts slots and nested root props (children, events[].title)", () => {
    const ok: ComponentMetadata = {
      name: "Timeline",
      exportIdentifier: "Timeline",
      importPath: "@mattbutlerengineering/rialto",
      subpath: "Timeline",
      props: [{ name: "events", type: "TimelineEvent[]", resolvedType: "TimelineEvent[]", required: true, declaredInRialto: true }],
      slots: ["children"],
      characterLimits: [
        { prop: "events[].title", max: 60 },
        { prop: "children", max: 20 },
      ],
    };
    expect(() => assertCharacterLimitsResolve([ok])).not.toThrow();
  });

  it("EmptyState publishes a limit for `heading`, never `title`", () => {
    const empty = introspectComponents(RIALTO_ROOT).find((c) => c.name === "EmptyState");
    expect(empty).toBeDefined();
    const props = empty!.characterLimits.map((l) => l.prop);
    expect(props).toContain("heading");
    expect(props).not.toContain("title");
  });
});
