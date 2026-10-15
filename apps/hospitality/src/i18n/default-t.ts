import type { TFunction } from "i18next";
import { localeRuntime } from "./runtime.js";

/**
 * The dashboard runtime's `t`, for pure helpers that are called from event handlers or from
 * other surfaces that have not threaded a `t` through. Components should pass their own
 * `useTranslation().t` so they re-render on a locale switch.
 */
export const defaultT: TFunction = localeRuntime.i18n.t.bind(localeRuntime.i18n);
