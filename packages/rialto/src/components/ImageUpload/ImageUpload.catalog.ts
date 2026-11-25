/**
 * Catalog metadata for the ImageUpload component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const imageUploadCatalogMeta = {
  name: "ImageUpload",
  description:
    "Image picker tile with preview, progress and validation. Use to collect a single photo such as a venue logo, menu photo or guest avatar. Give a label, and set accept and maxSize to constrain the file.",
  charLimits: {
    label: 40,
    hint: 120,
    error: 120,
  },
} satisfies CatalogMeta;
