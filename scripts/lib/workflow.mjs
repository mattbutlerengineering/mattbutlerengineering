/**
 * One parsed view of `.github/workflows/*.yml` for scripts, gates, and tests.
 *
 * Replaces indentation/regex re-derivation of workflow structure (#6393):
 * parse once with a real YAML parser, then assert on structure so checks
 * survive reformatting (flow-style `needs: [a, b]`, scalar `on: push`, ...).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";

export const WORKFLOWS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".github",
  "workflows"
);

const asArray = (value) => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

/** `on:` as an event -> config map, whatever form the workflow wrote. */
function normalizeOn(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") return { [raw]: {} };
  if (Array.isArray(raw)) return Object.fromEntries(raw.map((event) => [event, {}]));
  return Object.fromEntries(Object.entries(raw).map(([event, cfg]) => [event, cfg ?? {}]));
}

function normalizeStep(step) {
  return {
    ...step,
    name: step.name ?? null,
    uses: step.uses ?? null,
    run: step.run ?? null,
    with: step.with ?? {},
    env: step.env ?? {},
    if: step.if ?? null,
  };
}

function normalizeJob(job) {
  return {
    ...job,
    needs: asArray(job.needs),
    if: job.if ?? null,
    env: job.env ?? {},
    permissions: job.permissions ?? null,
    steps: asArray(job.steps).map(normalizeStep),
  };
}

/**
 * @param {string} text raw workflow YAML
 * @returns {{name: string|null, on: Record<string, object>, permissions: any, env: object, jobs: Record<string, any>}}
 */
export function parseWorkflow(text) {
  const doc = loadYaml(text);
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("workflow YAML must be a mapping at the top level");
  }
  // YAML 1.1 parsers read the bare `on` key as boolean true; js-yaml does not,
  // but accept both so a parser swap cannot silently empty the trigger map.
  const rawOn = "on" in doc ? doc.on : doc.true;
  return {
    name: doc.name ?? null,
    on: normalizeOn(rawOn),
    permissions: doc.permissions ?? null,
    env: doc.env ?? {},
    jobs: Object.fromEntries(
      Object.entries(doc.jobs ?? {}).map(([id, job]) => [id, normalizeJob(job ?? {})])
    ),
  };
}

/** Loads by absolute/relative path, or by bare file name under .github/workflows. */
export function loadWorkflow(nameOrPath) {
  const path =
    isAbsolute(nameOrPath) || nameOrPath.includes("/")
      ? nameOrPath
      : join(WORKFLOWS_DIR, nameOrPath);
  return parseWorkflow(readFileSync(path, "utf8"));
}

/** Sorted `.yml`/`.yaml` file names in `dir`. */
export function listWorkflowFiles(dir = WORKFLOWS_DIR) {
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort();
}

export function getJob(workflow, jobId) {
  return workflow.jobs[jobId] ?? null;
}

/** First step whose `name` equals `name` (string) or matches it (RegExp); null if none. */
export function getStep(job, name) {
  const test = name instanceof RegExp ? (s) => name.test(s.name ?? "") : (s) => s.name === name;
  return job.steps.find(test) ?? null;
}

/** All of a job's step `run:` scripts joined with newlines (comment-free, parsed text). */
export function jobRunText(job) {
  return job.steps
    .map((s) => s.run)
    .filter(Boolean)
    .join("\n");
}

/** Every env var name a job sets, at job level or on any step. */
export function jobEnvNames(job) {
  return [...Object.keys(job.env), ...job.steps.flatMap((s) => Object.keys(s.env))];
}
