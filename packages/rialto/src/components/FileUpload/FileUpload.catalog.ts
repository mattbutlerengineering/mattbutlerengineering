/**
 * Catalog metadata for the FileUpload component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const fileUploadCatalogMeta = {
  name: "FileUpload",
  description:
    "File picker with a drop zone and a removable file list. Use to collect documents or several files at once, such as a menu PDF or a CSV guest import. Give a label, and set accept (for example .pdf), maxSize and multiple to constrain the files.",
  charLimits: {
    label: 40,
    hint: 120,
    error: 120,
  },
} satisfies CatalogMeta;
