import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { buildInventory, mergeInventory } from "./audit-surface-registry.js";
import type { AuditInventory } from "./audit-surface-registry.js";

const INVENTORY_PATH = ".audit-state/inventory.json";

export async function loadInventory(repoPath: string): Promise<AuditInventory> {
  const filePath = join(repoPath, INVENTORY_PATH);
  const fresh = buildInventory();

  try {
    const content = await readFile(filePath, "utf-8");
    const existing = JSON.parse(content) as AuditInventory;
    return mergeInventory(fresh, existing);
  } catch {
    return fresh;
  }
}

export async function saveInventory(repoPath: string, inventory: AuditInventory): Promise<void> {
  const filePath = join(repoPath, INVENTORY_PATH);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(inventory, null, 2));
}
