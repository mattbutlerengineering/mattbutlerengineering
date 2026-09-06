// @vitest-environment node
/**
 * TDD: generate-registry.ts must consume the canonical introspectComponents()
 * model from component-metadata.ts rather than duplicating TS-Compiler-API
 * parsing.  Registry output must remain byte-identical to the committed
 * registry.json.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { introspectComponents, type ComponentMetadata } from "./component-metadata.js";
import { buildRegistry } from "./generate-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RIALTO_ROOT = path.resolve(__dirname, "..");

describe("buildRegistry", () => {
  // introspectComponents() runs a full TS Compiler API program+typecheck —
  // expensive enough that calling it fresh per-test (as this file used to)
  // multiplies that cost by 5x and, under CI's real turbo-parallel contention,
  // pushed individual tests past vitest's 15s timeout (nightly-compliance
  // #4701/#4780/#4877/#4947/#4997/#5052). One parse shared by all tests below,
  // same pattern already used correctly in all-artifacts.drift.test.ts.
  let components: ComponentMetadata[];

  beforeAll(() => {
    components = introspectComponents(RIALTO_ROOT);
  });

  it("accepts ComponentMetadata[] and returns a Registry with matching component count", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(RIALTO_ROOT, "package.json"), "utf-8")) as {
      version: string;
    };

    const registry = buildRegistry(components, pkg.version);

    expect(registry.version).toBe(pkg.version);
    expect(registry.components).toHaveLength(components.length);
  });

  it("maps importPath from ComponentMetadata", () => {
    const registry = buildRegistry(components, "0.0.0");

    for (const comp of registry.components) {
      expect(comp.importPath).toBe("@mattbutlerengineering/rialto");
    }
  });

  it("omits characterLimits when empty (byte-identity rule)", () => {
    const registry = buildRegistry(components, "0.0.0");

    // AccordionItem has no character limits — must not appear in output
    const accordionItem = registry.components.find((c) => c.name === "AccordionItem");
    expect(accordionItem).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(accordionItem, "characterLimits")).toBe(false);
  });

  it("props contain only registry fields (name, type, required; optional default, description)", () => {
    const registry = buildRegistry(components, "0.0.0");

    const button = registry.components.find((c) => c.name === "Button");
    expect(button).toBeDefined();

    for (const prop of button!.props) {
      // Required registry fields
      expect(typeof prop.name).toBe("string");
      expect(typeof prop.type).toBe("string");
      expect(typeof prop.required).toBe("boolean");
      // Must NOT include canonical-model-only fields
      expect(Object.prototype.hasOwnProperty.call(prop, "resolvedType")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(prop, "declaredInRialto")).toBe(false);
    }
  });

  it("produces JSON identical to committed registry.json", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(RIALTO_ROOT, "package.json"), "utf-8")) as {
      version: string;
    };

    const registry = buildRegistry(components, pkg.version);
    const serialized = JSON.stringify(registry, null, 2) + "\n";

    const committed = fs.readFileSync(path.join(RIALTO_ROOT, "registry.json"), "utf-8");
    expect(serialized).toBe(committed);
  });
});
