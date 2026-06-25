import type {
  AuditInventory,
  AuditSurface,
  LighthouseScores,
  Regression,
  ScoreEntry,
  Zone,
} from "./audit-surface-registry.js";
import { ZONES } from "./audit-surface-registry.js";

// ── Zone Staleness ──────────────────────────────────────────────────

export function findStalestZone(inventory: AuditInventory): Zone {
  const zoneAges = new Map<Zone, number>();

  for (const zone of ZONES) {
    const zoneSurfaces = inventory.surfaces.filter((s) => s.zone === zone);
    if (zoneSurfaces.length === 0) continue;

    const avgAge =
      zoneSurfaces.reduce((sum, s) => {
        if (!s.lastChecked) return sum + Infinity;
        return sum + (Date.now() - new Date(s.lastChecked).getTime());
      }, 0) / zoneSurfaces.length;

    zoneAges.set(zone, avgAge);
  }

  let stalest: Zone = ZONES[0];
  let maxAge = -1;

  for (const [zone, age] of zoneAges) {
    if (age > maxAge) {
      maxAge = age;
      stalest = zone;
    }
  }

  return stalest;
}

// ── Score Update ────────────────────────────────────────────────────

const MAX_HISTORY = 10;

export function updateSurfaceScore(s: AuditSurface, scores: LighthouseScores): AuditSurface {
  const entry: ScoreEntry = { timestamp: new Date().toISOString(), scores };
  const history = [...s.checkHistory, entry].slice(-MAX_HISTORY);

  return {
    ...s,
    lastChecked: entry.timestamp,
    lastScore: scores,
    checkHistory: history,
    checkCount: s.checkCount + 1,
  };
}

// ── Regression Detection ────────────────────────────────────────────

const REGRESSION_THRESHOLD = 0.05;

export function detectRegression(s: AuditSurface, newScores: LighthouseScores): Regression | null {
  if (!s.lastScore) return null;

  const categories: (keyof LighthouseScores)[] = [
    "performance",
    "accessibility",
    "bestPractices",
    "seo",
  ];

  let worst: Regression | null = null;

  for (const cat of categories) {
    const drop = s.lastScore[cat] - newScores[cat];
    if (drop > REGRESSION_THRESHOLD && (!worst || drop > worst.drop)) {
      worst = {
        surfaceId: s.id,
        category: cat,
        previousScore: s.lastScore[cat],
        currentScore: newScores[cat],
        drop,
      };
    }
  }

  return worst;
}
