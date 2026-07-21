import type { AuditInventory, AuditSurface, Zone } from "./audit-surface-registry.js";

const FRONTEND_ZONES: readonly Zone[] = ["marketing", "hospitality", "rialto", "gen"];

function fileToZones(filePath: string): readonly Zone[] | "all" | null {
  if (filePath.startsWith("infrastructure/")) return "all";
  if (filePath.startsWith("packages/rialto/")) return FRONTEND_ZONES;

  const appMatch = filePath.match(/^apps\/([^/]+)\//);
  if (appMatch) {
    const zoneMap: Record<string, Zone> = {
      marketing: "marketing",
      hospitality: "hospitality",
      "rialto-web": "rialto",
      gen: "gen",
    };
    const zone = zoneMap[appMatch[1] ?? ""];
    return zone ? [zone] : null;
  }

  const svcMatch = filePath.match(/^services\/([^/]+)\//);
  if (svcMatch) {
    const zoneMap: Record<string, Zone> = {
      users: "api:users",
      reservations: "api:reservations",
      agent: "api:agent",
    };
    const zone = zoneMap[svcMatch[1] ?? ""];
    return zone ? [zone] : null;
  }

  if (filePath.startsWith("packages/")) return FRONTEND_ZONES;

  return null;
}

export function mapFilesToSurfaces(
  inventory: AuditInventory,
  changedFiles: readonly string[]
): readonly AuditSurface[] {
  const matchedIds = new Set<string>();

  for (const file of changedFiles) {
    const zones = fileToZones(file);

    if (zones === "all") return [...inventory.surfaces];
    if (zones === null) continue;

    // Exact sourceFile match → specific surface
    for (const s of inventory.surfaces) {
      if (s.sourceFiles.some((sf) => file.startsWith(sf) || file === sf)) {
        matchedIds.add(s.id);
      }
    }

    // For frontend apps: page files map to specific surfaces (handled above).
    // Shared files (components, layouts, etc.) map to all surfaces in zone.
    // For services: ALL files map to all surfaces in that service's zone.
    const isFrontendPageFile = file.includes("/pages/") && !file.startsWith("services/");
    if (!isFrontendPageFile) {
      for (const zone of zones) {
        for (const s of inventory.surfaces) {
          if (s.zone === zone) matchedIds.add(s.id);
        }
      }
    }
  }

  return inventory.surfaces.filter((s) => matchedIds.has(s.id));
}
