// @vitest-environment node
/**
 * TDD: generate-registry.ts must consume the canonical introspectComponents()
 * model from component-metadata.ts rather than duplicating TS-Compiler-API
 * parsing.  Registry output must remain byte-identical to the committed
 * registry.json.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { introspectComponents } from "./component-metadata.js";
import { buildRegistry } from "./generate-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RIALTO_ROOT = path.resolve(__dirname, "..");

describe("buildRegistry", () => {
  it("accepts ComponentMetadata[] and returns a Registry with matching component count", () => {
    const components = introspectComponents(RIALTO_ROOT);
    const pkg = JSON.parse(fs.readFileSync(path.join(RIALTO_ROOT, "package.json"), "utf-8")) as {
      version: string;
    };

    const registry = buildRegistry(components, pkg.version);

    expect(registry.version).toBe(pkg.version);
    expect(registry.components).toHaveLength(components.length);
  });

  it("maps importPath from ComponentMetadata", () => {
    const components = introspectComponents(RIALTO_ROOT);
    const registry = buildRegistry(components, "0.0.0");

    for (const comp of registry.components) {
      expect(comp.importPath).toBe("@mattbutlerengineering/rialto");
    }
  });

  it("omits characterLimits when empty (byte-identity rule)", () => {
    const components = introspectComponents(RIALTO_ROOT);
    const registry = buildRegistry(components, "0.0.0");

    // AccordionItem has no character limits — must not appear in output
    const accordionItem = registry.components.find((c) => c.name === "AccordionItem");
    expect(accordionItem).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(accordionItem, "characterLimits")).toBe(false);
  });

  it("props contain only registry fields (name, type, required; optional default, description)", () => {
    const components = introspectComponents(RIALTO_ROOT);
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
    const components = introspectComponents(RIALTO_ROOT);
    const pkg = JSON.parse(fs.readFileSync(path.join(RIALTO_ROOT, "package.json"), "utf-8")) as {
      version: string;
    };

    const registry = buildRegistry(components, pkg.version);
    const serialized = JSON.stringify(registry, null, 2) + "\n";

    const committed = fs.readFileSync(path.join(RIALTO_ROOT, "registry.json"), "utf-8");
    expect(serialized).toBe(committed);
  });
});
