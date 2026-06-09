import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { taskSchema, type Task } from "./types.js";

/**
 * Loads and validates golden tasks from a suite directory.
 *
 * Each `*.json` file in the directory is one task. Parsing/validation lives
 * here so callers get fully-validated {@link Task}s or a clear, sourced error.
 */
export async function loadSuite(dir: string): Promise<Task[]> {
  let entries: string[];
  try {
    entries = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch (err) {
    throw new Error(
      `Could not read eval suite directory "${dir}": ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  const tasks: Task[] = [];
  const seen = new Set<string>();
  for (const file of entries) {
    const path = join(dir, file);
    const task = await loadTaskFile(path);
    if (seen.has(task.id)) {
      throw new Error(`Duplicate task id "${task.id}" in eval suite (${file})`);
    }
    seen.add(task.id);
    tasks.push(task);
  }
  return tasks;
}

async function loadTaskFile(path: string): Promise<Task> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    throw new Error(
      `Invalid JSON in eval task "${path}": ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  const parsed = taskSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid eval task "${path}": ${parsed.error.message}`);
  }
  return parsed.data;
}
