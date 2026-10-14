/**
 * Catalog parity: every en-US key must exist in each required locale, with
 * the same {{placeholders}} and every plural form that locale needs. See
 * scripts/check-i18n-catalogs.mjs and docs/features/localization/.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  compareCatalog,
  findCatalogFindings,
  formatFinding,
  CATALOG_GLOB_DIR,
} from "../check-i18n-catalogs.mjs";

const EN = {
  shell: { skipToMain: "Skip to main content" },
  guests: {
    greeting: "Hello {{name}}",
    count_one: "{{count}} guest",
    count_other: "{{count}} guests",
  },
};

const ES = {
  shell: { skipToMain: "Saltar al contenido principal" },
  guests: {
    greeting: "Hola {{name}}",
    count_one: "{{count}} huésped",
    count_many: "{{count}} huéspedes",
    count_other: "{{count}} huéspedes",
  },
};

const problems = (findings) => findings.map((f) => `${f.key}: ${f.problem}`);

describe("compareCatalog", () => {
  it("passes a complete translation", () => {
    expect(compareCatalog({ base: EN, target: ES, tag: "es-MX", required: true })).toEqual([]);
  });

  it("flags a key missing from a required locale", () => {
    const target = { ...ES, shell: {} };
    expect(problems(compareCatalog({ base: EN, target, tag: "es-MX", required: true }))).toEqual([
      "shell.skipToMain: missing",
    ]);
  });

  it("lets an optional locale (en-GB) omit keys", () => {
    expect(compareCatalog({ base: EN, target: {}, tag: "en-GB", required: false })).toEqual([]);
  });

  it("flags a key that only exists outside en-US, even in an optional locale", () => {
    const target = { shell: { skipToMain: "Skip", extra: "Stray" } };
    expect(problems(compareCatalog({ base: EN, target, tag: "en-GB", required: false }))).toEqual([
      "shell.extra: not in en-US",
    ]);
  });

  it("flags placeholders that differ from en-US", () => {
    const target = { ...ES, guests: { ...ES.guests, greeting: "Hola {{nombre}}" } };
    expect(problems(compareCatalog({ base: EN, target, tag: "es-MX", required: true }))).toEqual([
      "guests.greeting: placeholders {{nombre}} ≠ en-US {{name}}",
    ]);
  });

  it("requires every plural category the target locale uses", () => {
    const { count_many: _dropped, ...withoutMany } = ES.guests;
    const target = { ...ES, guests: withoutMany };
    expect(problems(compareCatalog({ base: EN, target, tag: "es-MX", required: true }))).toEqual([
      "guests.count_many: missing plural form",
    ]);
  });

  it("flags a non-string leaf", () => {
    const target = { ...ES, shell: { skipToMain: 42 } };
    expect(problems(compareCatalog({ base: EN, target, tag: "es-MX", required: true }))).toEqual([
      "shell.skipToMain: not a string",
    ]);
  });
});

describe("findCatalogFindings", () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  function makeApp(app, files) {
    dir ??= mkdtempSync(join(tmpdir(), "i18n-catalogs-"));
    const catalogDir = join(dir, "apps", app, CATALOG_GLOB_DIR);
    mkdirSync(catalogDir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(
        join(catalogDir, name),
        typeof content === "string" ? content : JSON.stringify(content)
      );
    }
  }

  it("passes when every app's catalogs are in parity", () => {
    makeApp("hospitality", {
      "en-US.json": EN,
      "en-GB.json": {},
      "es-MX.json": ES,
      "fr-CA.json": ES,
    });
    expect(findCatalogFindings(dir)).toEqual([]);
  });

  it("flags a required locale with no catalog file", () => {
    makeApp("hospitality", { "en-US.json": EN, "es-MX.json": ES });
    expect(findCatalogFindings(dir).map((f) => `${f.file}: ${f.problem}`)).toEqual([
      "apps/hospitality/src/i18n/catalogs/fr-CA.json: missing catalog",
    ]);
  });

  it("reports unparseable JSON as a finding, not a crash", () => {
    makeApp("hospitality", { "en-US.json": EN, "es-MX.json": "{ nope", "fr-CA.json": ES });
    expect(findCatalogFindings(dir).map((f) => f.problem)).toEqual([
      expect.stringMatching(/^unparseable JSON/),
    ]);
  });

  it("flags a catalog for an unsupported locale", () => {
    makeApp("hospitality", {
      "en-US.json": EN,
      "es-MX.json": ES,
      "fr-CA.json": ES,
      "de-DE.json": {},
    });
    expect(findCatalogFindings(dir).map((f) => f.problem)).toEqual(["unsupported locale"]);
  });

  it("ignores apps without a catalogs directory", () => {
    dir = mkdtempSync(join(tmpdir(), "i18n-catalogs-"));
    mkdirSync(join(dir, "apps", "marketing", "src"), { recursive: true });
    expect(findCatalogFindings(dir)).toEqual([]);
  });
});

describe("formatFinding", () => {
  it("names the file and the key", () => {
    expect(
      formatFinding({ file: "apps/x/src/i18n/catalogs/es-MX.json", key: "a.b", problem: "missing" })
    ).toBe("apps/x/src/i18n/catalogs/es-MX.json — a.b: missing");
  });
});
