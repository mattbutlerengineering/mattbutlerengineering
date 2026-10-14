import "i18next";
import type enUS from "./catalogs/en-US.json";

// Typed keys: `t()` accepts only keys present in the en-US catalog.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof enUS };
  }
}
