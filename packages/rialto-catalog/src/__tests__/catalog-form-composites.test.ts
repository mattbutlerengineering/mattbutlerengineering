import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const componentsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../rialto/src/components"
);

const NAMES = ["TextArea", "Autocomplete", "DateRangePicker", "InputGroup", "Collapsible"];

describe("form & composite catalog metadata (#9516)", () => {
  for (const name of NAMES) {
    it(`${name} has a runtime-free catalog meta file`, async () => {
      const file = path.join(componentsDir, name, `${name}.catalog.ts`);
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.readFileSync(file, "utf8")).not.toMatch(/from ["']zod/);
      const mod = (await import(file)) as Record<string, { name: string; description: string }>;
      const metas = Object.values(mod);
      expect(metas).toHaveLength(1);
      expect(metas[0]!.name).toBe(name);
      expect(metas[0]!.description.length).toBeGreaterThan(20);
    });
  }
});
