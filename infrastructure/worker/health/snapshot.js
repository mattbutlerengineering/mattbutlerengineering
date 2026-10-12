/**
 * Single parser for stored/served health snapshots (#6385).
 *
 * Understands the `GET /health/system` response — coarse (status rollups only)
 * or detailed (per-service/static-site probes with latency) — and the compact
 * latency sample `{ services: { name: { latency, status } } }` that the
 * synthetic-monitoring workflow records to KV.
 *
 * The worker bundle cannot import `@mbe/types` (zod), so this is a
 * dependency-free reader; `snapshot.contract.test.js` pins it to the canonical
 * `systemHealthSchema` so the two cannot drift.
 */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Normalise a snapshot to `{ status, subsystems, probes }`.
 *  - subsystems: { [name]: { status } } — rollups (present in coarse + detailed)
 *  - probes: { [name]: { status, latency } } — per-service / static-site probes
 *    (detailed responses and latency samples only; latency may be null)
 */
function parseHealthSnapshot(raw) {
  const snap = isObject(raw) ? raw : {};
  const subsystems = {};
  const probes = {};

  if (isObject(snap.subsystems)) {
    for (const [name, sub] of Object.entries(snap.subsystems)) {
      if (!isObject(sub) || typeof sub.status !== "string") continue;
      subsystems[name] = { status: sub.status };
      if (!isObject(sub.checks)) continue;
      if (name !== "services" && name !== "static_sites") continue;
      for (const [probe, check] of Object.entries(sub.checks)) {
        if (isObject(check)) {
          probes[probe] = { status: check.status, latency: check.latency ?? null };
        }
      }
    }
  }

  // Compact latency sample written by the synthetic-monitoring workflow.
  if (isObject(snap.services)) {
    for (const [name, data] of Object.entries(snap.services)) {
      if (isObject(data)) probes[name] = { status: data.status, latency: data.latency ?? null };
    }
  }

  return { status: snap.status, subsystems, probes };
}

/** True when a subsystem/probe status counts as up. */
const isUpStatus = (s) => s === "healthy" || s === "ok";

export { parseHealthSnapshot, isUpStatus };
