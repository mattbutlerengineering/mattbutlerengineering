/**
 * Catalog metadata for the Handshake component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const handshakeCatalogMeta = {
  name: "Handshake",
  description:
    'Instrument showing a multi-party exchange such as an OIDC sign-in, webhook confirmation, or device pairing: named stations joined by legs with a credential pulse travelling along the active one. Set stations to 2+ unique short names in order, state=idle, negotiating (default), settled or failed, and lane to the index of the active leg (0 = first to second station). aria-label is required and names the exchange (e.g. "Verifying your sign-in"). Pair it with Text, Badge or DataList for per-station results.',
  propSchemas: {
    stations: "z.array(z.string().max(24)).min(2)",
  },
  charLimits: {
    "aria-label": 80,
  },
} satisfies CatalogMeta;
