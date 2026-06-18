/**
 * Shared KV access helper for health handler modules.
 *
 * A single place for the "read JSON from KV, return null on miss/error"
 * pattern used by all health aggregation handlers.
 */

/**
 * Read a KV key as JSON, returning null if missing or on error.
 */
async function readKvJson(kv, key) {
  try {
    return await kv.get(key, "json");
  } catch {
    return null;
  }
}

export { readKvJson };
