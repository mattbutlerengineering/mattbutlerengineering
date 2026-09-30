/**
 * references.mjs — the taste rater's committed OSS reference set
 * (docs/features/ui-quality-loop/architecture.md § Components "Taste rater";
 * autorun-brief decision 13).
 *
 * `docs/ui-quality/reference/references.json` is the provenance record: one
 * entry per committed PNG with the licensed repository and the commit its
 * LICENSE was read at. `rubric.json` `references[]` is the slice the rater
 * reads (`rubricReferences`). The sandbox has no egress, so a reference is only
 * ever a committed file; a site redesign is handled by re-capturing under a new
 * `rubric_version`, never by fetching.
 *
 * Only permissively-licensed open-source UIs are allowed — no proprietary
 * product (copyright/ToS exposure in a public repo), and no copyleft one
 * (Cal.com is AGPL-3.0 and excluded).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CATEGORIES } from "./rubric.mjs";

export const REFERENCES_FILE = "docs/ui-quality/reference/references.json";

/** SPDX ids a reference's source repository may carry. */
export const LICENSE_ALLOWLIST = Object.freeze([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
]);

const FIELDS = [
  "id",
  "category",
  "file",
  "app",
  "license",
  "source",
  "captured_at",
  "viewport",
  "sha256",
];

function entryErrors(ref, root) {
  const where = `reference ${JSON.stringify(ref.id)}`;
  const errors = FIELDS.filter((f) => ref[f] === undefined || ref[f] === null).map(
    (f) => `${where}: missing ${f}`
  );
  if (!LICENSE_ALLOWLIST.includes(ref.license)) {
    errors.push(`${where}: license ${ref.license} is not in ${LICENSE_ALLOWLIST.join("|")}`);
  }
  if (!CATEGORIES.includes(ref.category) || ref.category === "harness") {
    errors.push(`${where}: category ${ref.category} is not a rateable rubric category`);
  }
  if (!/^[0-9a-f]{40}$/.test(ref.source?.commit ?? "")) {
    errors.push(`${where}: source.commit must be a full commit sha`);
  }
  if (typeof ref.file === "string") {
    const path = join(root, ref.file);
    if (!existsSync(path)) {
      errors.push(`${where}: file ${ref.file} does not exist`);
    } else if (createHash("sha256").update(readFileSync(path)).digest("hex") !== ref.sha256) {
      errors.push(`${where}: sha256 does not match ${ref.file}`);
    }
  }
  return errors;
}

/** @returns {string[]} every problem with the reference set; empty means valid */
export function referenceErrors(doc, root) {
  const refs = Array.isArray(doc?.references) ? doc.references : null;
  if (!refs || refs.length === 0) return ["references must be a non-empty array"];
  const errors = refs.flatMap((ref) => entryErrors(ref, root));
  const seen = new Set();
  for (const ref of refs) {
    if (seen.has(ref.id)) errors.push(`reference ${JSON.stringify(ref.id)}: duplicate id`);
    seen.add(ref.id);
  }
  const covered = new Set(refs.map((r) => r.category));
  for (const category of CATEGORIES.filter((c) => c !== "harness")) {
    if (!covered.has(category)) errors.push(`no reference covers category ${category}`);
  }
  return errors;
}

/** The `rubric.json` `references[]` slice: what the rater needs, in references.json order. */
export function rubricReferences(doc) {
  return doc.references.map((r) => ({
    id: r.id,
    category: r.category,
    file: r.file,
    sha256: r.sha256,
    source: r.source.url,
    captured_at: r.captured_at,
  }));
}
