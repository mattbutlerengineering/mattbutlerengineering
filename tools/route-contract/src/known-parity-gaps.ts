/**
 * Today's measured client↔route schema-parity gaps, pinned by name.
 *
 * The guests parity assertion in `route-contract.test.ts` requires the
 * measured failures to EQUAL this list — so a new drift fails, and so does an
 * accidental fix (which must then delete its entry). The endpoint-definition
 * migration of the guests domain (docs/fixes/endpoint-definitions-pilot,
 * PR 3) closes every entry and deletes this file.
 *
 * Format: `<subClient.method> <facet>`.
 */
export const KNOWN_PARITY_GAPS: readonly string[] = [
  // body — the client sends a hand-built object with no schema; the route
  // validates against a Zod-derived body schema.
  "guests.create body",
  "guests.findOrCreate body",
  "guests.update body",
  "guests.addNote body",
  // query — the client builds its query string by hand (two of them by
  // string concatenation); the route validates a Zod-derived querystring.
  "guests.list query",
  "guests.search query",
  "guests.getSegments query",
  "guests.getLapsing query",
  // response — the client validates nothing; the route serializes an inline
  // hand-written schema.
  "guests.getLapsing response",
  "guests.sendWinBack response",
];
