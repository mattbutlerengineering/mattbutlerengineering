// Re-export barrel — callers import from here unchanged.
// Implementation split into focused modules:
//   audit-surface-registry.ts  — types, SURFACE_REGISTRY, buildInventory, mergeInventory
//   audit-inventory-store.ts   — loadInventory, saveInventory (all fs I/O)
//   audit-surface-mapper.ts    — mapFilesToSurfaces
//   audit-regression-detector.ts — findStalestZone, updateSurfaceScore, detectRegression

export {
  ZONES,
  BASE_URL,
  INVENTORY_VERSION,
  SURFACE_REGISTRY,
  buildInventory,
  mergeInventory,
} from "./audit-surface-registry.js";
export type {
  Zone,
  LighthouseScores,
  ScoreEntry,
  AuditSurface,
  AuditInventory,
  Regression,
} from "./audit-surface-registry.js";

export { loadInventory, saveInventory } from "./audit-inventory-store.js";

export { isNonAuditableFile, allFilesNonAuditable } from "./file-classifier.js";

export { mapFilesToSurfaces } from "./audit-surface-mapper.js";

export {
  findStalestZone,
  updateSurfaceScore,
  detectRegression,
} from "./audit-regression-detector.js";
