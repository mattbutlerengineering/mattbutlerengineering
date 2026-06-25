import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { loadInventory, saveInventory } from "../audit-inventory-store.js";
import { buildInventory } from "../audit-surface-registry.js";
import type { AuditInventory } from "../audit-surface-registry.js";

describe("loadInventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns fresh inventory when file does not exist", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    const inv = await loadInventory("/repo");
    expect(inv.surfaces.length).toBeGreaterThan(0);
    expect(inv.surfaces[0].lastChecked).toBeNull();
  });

  it("merges with existing inventory", async () => {
    const existing: AuditInventory = {
      surfaces: [
        {
          id: "marketing:home",
          zone: "marketing",
          type: "page",
          url: "https://mattbutlerengineering.com/",
          sourceFiles: [],
          auth: "none",
          lastChecked: "2026-03-28T10:00:00Z",
          lastScore: { performance: 0.95, accessibility: 0.98, bestPractices: 0.92, seo: 0.97 },
          checkHistory: [],
          checkCount: 1,
        },
      ],
      lastUpdated: "2026-03-28T10:00:00Z",
      version: 1,
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(existing));

    const inv = await loadInventory("/repo");
    const home = inv.surfaces.find((s) => s.id === "marketing:home");
    expect(home?.lastChecked).toBe("2026-03-28T10:00:00Z");
  });
});

describe("saveInventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  it("writes to .audit-state/inventory.json", async () => {
    await saveInventory("/repo", buildInventory());
    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith(
      "/repo/.audit-state/inventory.json",
      expect.stringContaining("marketing:home")
    );
  });
});
