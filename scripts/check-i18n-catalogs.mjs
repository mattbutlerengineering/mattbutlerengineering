#!/usr/bin/env node

/**
 * Fails when an app's translation catalogs drift from its en-US catalog.
 *
 * Catalogs live at `apps/<app>/src/i18n/catalogs/<tag>.json` (i18next JSON,
 * nested keys, `_one`/`_many`/`_other` plural suffixes, `{{name}}`
 * placeholders). en-US is the source; es-MX and fr-CA must carry every key;
 * en-GB may omit keys because i18next falls back to en-US by design
 * (docs/features/localization/architecture.md § Catalog parity check).
 *
 * Without this, a key added in en-US but not translated renders English in a
 * localized UI with no error anywhere — i18next's fallback hides it.
 *
 * Follows scripts/check-story-coverage.mjs: pure finders, the shared
 * scripts/lib/fitness-check.mjs reporter for PASS/FAIL and exit code.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { root } from "./dep-graph-discovery.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

/** Catalog directory inside each app. */
export const CATALOG_GLOB_DIR = "src/i18n/catalogs";

const BASE_TAG = "en-US";
/** Locales that must translate every key. */
const REQUIRED_TAGS = ["es-MX", "fr-CA"];
/** Locales that may omit keys (fall back to en-US). */
const OPTIONAL_TAGS = ["en-GB"];

const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * @typedef {{ file?: string, key: string, problem: string }} Finding
 */

/** Flatten nested catalog objects to `dot.path` → leaf value. */
function flatten(obj, prefix = "") {
  const out = new Map();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const [ck, cv] of flatten(v, key)) out.set(ck, cv);
    } else {
      out.set(key, v);
    }
  }
  return out;
}

/** Split `count_one` into `{ unit: "count", category: "one" }`. */
function splitPlural(key) {
  const match = key.match(PLURAL_SUFFIX_RE);
  return match ? { unit: key.slice(0, -match[0].length), category: match[1] } : { unit: key };
}

function placeholders(value) {
  return [...String(value).matchAll(PLACEHOLDER_RE)]
    .map((m) => m[1])
    .sort()
    .join(",");
}

function formatPlaceholders(list) {
  return list
    ? list
        .split(",")
        .map((p) => `{{${p}}}`)
        .join(" ")
    : "(none)";
}

/** en-US units: plain keys, and plural groups keyed by their stem. */
function baseUnits(base) {
  const units = new Map();
  for (const [key, value] of flatten(base)) {
    const { unit, category } = splitPlural(key);
    const entry = units.get(unit) ?? { plural: false, placeholders: placeholders(value) };
    if (category) {
      entry.plural = true;
      if (category === "other") entry.placeholders = placeholders(value);
    }
    units.set(unit, entry);
  }
  return units;
}

/**
 * Compare one locale's catalog against en-US.
 *
 * @param {{ base: object, target: object, tag: string, required: boolean }} opts
 * @returns {Finding[]}
 */
export function compareCatalog({ base, target, tag, required }) {
  const units = baseUnits(base);
  const categories = new Intl.PluralRules(tag).resolvedOptions().pluralCategories;
  const targetFlat = flatten(target);
  const findings = [];

  for (const [key, value] of targetFlat) {
    const { unit } = splitPlural(key);
    const baseUnit = units.get(unit);
    if (!baseUnit) {
      findings.push({ key, problem: "not in en-US" });
      continue;
    }
    if (typeof value !== "string") {
      findings.push({ key, problem: "not a string" });
      continue;
    }
    const got = placeholders(value);
    if (got !== baseUnit.placeholders) {
      findings.push({
        key,
        problem: `placeholders ${formatPlaceholders(got)} ≠ en-US ${formatPlaceholders(baseUnit.placeholders)}`,
      });
    }
  }

  for (const [unit, { plural }] of units) {
    if (!plural) {
      if (required && !targetFlat.has(unit)) findings.push({ key: unit, problem: "missing" });
      continue;
    }
    const present = categories.filter((c) => targetFlat.has(`${unit}_${c}`));
    if (!required && present.length === 0) continue;
    for (const c of categories) {
      if (!targetFlat.has(`${unit}_${c}`)) {
        findings.push({ key: `${unit}_${c}`, problem: "missing plural form" });
      }
    }
  }

  return findings;
}

function readCatalog(path) {
  try {
    return { catalog: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { error: `unparseable JSON (${error.message})` };
  }
}

/**
 * Every finding across `<repoRoot>/apps/*\/src/i18n/catalogs/`.
 *
 * @param {string} repoRoot
 * @returns {Finding[]}
 */
export function findCatalogFindings(repoRoot) {
  const appsDir = join(repoRoot, "apps");
  if (!existsSync(appsDir)) return [];
  const findings = [];

  for (const app of readdirSync(appsDir).sort()) {
    const rel = `apps/${app}/${CATALOG_GLOB_DIR}`;
    const dir = join(repoRoot, rel);
    if (!existsSync(dir)) continue;

    const tags = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .sort();
    const fileOf = (tag) => `${rel}/${tag}.json`;

    for (const tag of tags) {
      if (![BASE_TAG, ...REQUIRED_TAGS, ...OPTIONAL_TAGS].includes(tag)) {
        findings.push({ file: fileOf(tag), key: "", problem: "unsupported locale" });
      }
    }

    if (!tags.includes(BASE_TAG)) {
      findings.push({ file: fileOf(BASE_TAG), key: "", problem: "missing catalog" });
      continue;
    }
    const base = readCatalog(join(dir, `${BASE_TAG}.json`));
    if (base.error) {
      findings.push({ file: fileOf(BASE_TAG), key: "", problem: base.error });
      continue;
    }

    for (const tag of [...REQUIRED_TAGS, ...OPTIONAL_TAGS]) {
      const required = REQUIRED_TAGS.includes(tag);
      if (!tags.includes(tag)) {
        if (required) findings.push({ file: fileOf(tag), key: "", problem: "missing catalog" });
        continue;
      }
      const target = readCatalog(join(dir, `${tag}.json`));
      if (target.error) {
        findings.push({ file: fileOf(tag), key: "", problem: target.error });
        continue;
      }
      for (const f of compareCatalog({
        base: base.catalog,
        target: target.catalog,
        tag,
        required,
      })) {
        findings.push({ ...f, file: fileOf(tag) });
      }
    }
  }

  return findings;
}

/**
 * @param {Finding} finding
 * @returns {string}
 */
export function formatFinding({ file, key, problem }) {
  return key ? `${file} — ${key}: ${problem}` : `${file} — ${problem}`;
}

/* c8 ignore start -- CLI entrypoint, exercised via repo-audit not unit tests */
const isMain = process.argv[1] && process.argv[1].endsWith("check-i18n-catalogs.mjs");

if (isMain) {
  process.exit(
    runCheck({
      name: "i18n catalog parity",
      findings: findCatalogFindings(root),
      formatFinding,
      passMessage:
        "PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.",
    })
  );
}
/* c8 ignore stop */
