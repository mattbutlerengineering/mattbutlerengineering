// @vitest-environment node
/**
 * TDD: generate-manifest.ts must consume the canonical introspectComponents()
 * model from component-metadata.ts rather than duplicating TS-Compiler-API
 * parsing. Manifest output components must be byte-identical to what the old
 * generator produced.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { introspectComponents } from "./component-metadata.js";
import { buildManifest } from "./generate-manifest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RIALTO_ROOT = path.resolve(__dirname, "..");

describe("buildManifest", () => {
  it("accepts ComponentMetadata[] and returns a Manifest with matching component count", () => {
    const components = introspectComponents(RIALTO_ROOT);
    const pkg = JSON.parse(fs.readFileSync(path.join(RIALTO_ROOT, "package.json"), "utf-8")) as {
      version: string;
    };

    const manifest = buildManifest(components, pkg.version, "2026-01-01T00:00:00.000Z");

    expect(manifest.version).toBe(pkg.version);
    expect(manifest.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(manifest.components).toHaveLength(components.length);
  });

  it("omits characterLimits when empty (byte-identity rule)", () => {
    const components = introspectComponents(RIALTO_ROOT);
    const manifest = buildManifest(components, "0.0.0", "2026-01-01T00:00:00.000Z");

    // AccordionItem has no character limits — must not appear in output
    const accordionItem = manifest.components.find((c) => c.name === "AccordionItem");
    expect(accordionItem).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(accordionItem, "characterLimits")).toBe(false);
  });

  it("includes characterLimits when non-empty", () => {
    const components = introspectComponents(RIALTO_ROOT);
    const manifest = buildManifest(components, "0.0.0", "2026-01-01T00:00:00.000Z");

    const button = manifest.components.find((c) => c.name === "Button");
    expect(button?.characterLimits).toBeDefined();
    expect(button!.characterLimits!.length).toBeGreaterThan(0);
  });

  it("props contain only manifest fields (no resolvedType or declaredInRialto)", () => {
    const components = introspectComponents(RIALTO_ROOT);
    const manifest = buildManifest(components, "0.0.0", "2026-01-01T00:00:00.000Z");

    const button = manifest.components.find((c) => c.name === "Button");
    expect(button).toBeDefined();

    for (const prop of button!.props) {
      expect(Object.prototype.hasOwnProperty.call(prop, "resolvedType")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(prop, "declaredInRialto")).toBe(false);
    }
  });

  it("components are in byte-order (not localeCompare)", () => {
    const components = introspectComponents(RIALTO_ROOT);
    const manifest = buildManifest(components, "0.0.0", "2026-01-01T00:00:00.000Z");

    const names = manifest.components.map((c) => c.name);
    const sortedByByteOrder = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(names).toEqual(sortedByByteOrder);
  });

  it("manifest has no importPath per component (manifest-specific format)", () => {
    const components = introspectComponents(RIALTO_ROOT);
    const manifest = buildManifest(components, "0.0.0", "2026-01-01T00:00:00.000Z");

    for (const comp of manifest.components) {
      expect(Object.prototype.hasOwnProperty.call(comp, "importPath")).toBe(false);
    }
  });
});
