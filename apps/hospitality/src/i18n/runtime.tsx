import i18next, { type i18n } from "i18next";
import { useTranslation, initReactI18next } from "react-i18next";
import type { ReactNode } from "react";
import {
  RialtoLocaleProvider,
  enUS as rialtoEnUS,
  type RialtoMessages,
} from "@mattbutlerengineering/rialto/providers";
import enUS from "./catalogs/en-US.json";
import { DEFAULT_LOCALE, resolveLocale, type LocaleTag } from "./locales.js";

/**
 * The app's only code that loads catalogs or changes language.
 *
 * en-US is bundled; other locales' app catalog and Rialto messages are
 * fetched together on first use, then cached. A switch is all-or-nothing: if
 * either load fails or exceeds the timeout, language, storage and `<html lang>`
 * stay where they were and the promise rejects (the picker offers Retry).
 */

export const LOCALE_STORAGE_KEY = "mbe-hospitality-locale";
const LOAD_TIMEOUT_MS = 10_000;

type Catalog = Record<string, unknown>;

export interface RuntimeDeps {
  loadAppCatalog: (tag: LocaleTag) => Promise<Catalog>;
  loadRialtoMessages: (tag: LocaleTag) => Promise<RialtoMessages>;
  /** `set` returns false when the write is refused (blocked or full storage); it never throws. */
  storage: { get: (key: string) => string | null; set: (key: string, value: string) => boolean };
  browserLanguages: () => readonly string[];
  setDocumentLang: (tag: LocaleTag) => void;
  timeoutMs: number;
  /** Where the explicit choice is persisted. Defaults to the dashboard's key. */
  storageKey?: string;
}

const APP_CATALOGS: Record<Exclude<LocaleTag, "en-US">, () => Promise<{ default: Catalog }>> = {
  "en-GB": () => import("./catalogs/en-GB.json"),
  "es-MX": () => import("./catalogs/es-MX.json"),
  "fr-CA": () => import("./catalogs/fr-CA.json"),
};

const RIALTO_MESSAGES: Record<Exclude<LocaleTag, "en-US">, () => Promise<RialtoMessages>> = {
  "en-GB": () => import("@mattbutlerengineering/rialto/locales/en-GB").then((m) => m.enGB),
  "es-MX": () => import("@mattbutlerengineering/rialto/locales/es-MX").then((m) => m.esMX),
  "fr-CA": () => import("@mattbutlerengineering/rialto/locales/fr-CA").then((m) => m.frCA),
};

/** localStorage that reports refusal (private mode, blocked site data, quota) instead of throwing. */
export const browserStorage: RuntimeDeps["storage"] = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};

export const browserDeps: RuntimeDeps = {
  loadAppCatalog: async (tag) => (tag === "en-US" ? enUS : (await APP_CATALOGS[tag]()).default),
  loadRialtoMessages: async (tag) => (tag === "en-US" ? rialtoEnUS : RIALTO_MESSAGES[tag]()),
  storage: browserStorage,
  browserLanguages: () => (typeof navigator === "undefined" ? [] : navigator.languages),
  setDocumentLang: (tag) => document.documentElement.setAttribute("lang", tag),
  timeoutMs: LOAD_TIMEOUT_MS,
};

function withTimeout<T>(promise: Promise<T>, ms: number, tag: LocaleTag): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Loading ${tag} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export interface LocaleRuntime {
  readonly i18n: i18n;
  /**
   * The locale `bootLocale` will start in: stored, else `preferred`, else browser, else en-US.
   * Synchronous, so a caller can tell whether anything must load before first paint.
   */
  bootTarget(preferred?: LocaleTag): LocaleTag;
  /** Switch to `bootTarget(preferred)`. Never rejects; never persists. */
  bootLocale(preferred?: LocaleTag): Promise<void>;
  /** Explicit user choice: load, switch, set `<html lang>`, persist. Rejects with nothing changed. */
  changeLocale(tag: LocaleTag): Promise<void>;
  /** Rialto messages for a loaded locale. */
  rialtoMessages(tag: LocaleTag): RialtoMessages;
}

export function createLocaleRuntime(deps: RuntimeDeps = browserDeps): LocaleRuntime {
  const storageKey = deps.storageKey ?? LOCALE_STORAGE_KEY;
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    resources: { [DEFAULT_LOCALE]: { translation: enUS } },
    initAsync: false,
    interpolation: { escapeValue: false }, // React escapes
  });

  const rialtoCache = new Map<LocaleTag, RialtoMessages>([[DEFAULT_LOCALE, rialtoEnUS]]);

  async function apply(tag: LocaleTag): Promise<void> {
    if (!rialtoCache.has(tag)) {
      const [catalog, messages] = await withTimeout(
        Promise.all([deps.loadAppCatalog(tag), deps.loadRialtoMessages(tag)]),
        deps.timeoutMs,
        tag
      );
      instance.addResourceBundle(tag, "translation", catalog, true, true);
      rialtoCache.set(tag, messages);
    }
    await instance.changeLanguage(tag);
    deps.setDocumentLang(tag);
  }

  return {
    i18n: instance,
    bootTarget(preferred) {
      return resolveLocale({
        stored: deps.storage.get(storageKey),
        browser: preferred ? [preferred, ...deps.browserLanguages()] : deps.browserLanguages(),
      });
    },
    async bootLocale(preferred) {
      const tag = this.bootTarget(preferred);
      try {
        await apply(tag);
      } catch {
        // lean: boot failure is silent and stays en-US; the picker surfaces load errors on an explicit switch.
        await apply(DEFAULT_LOCALE);
      }
    },
    async changeLocale(tag) {
      await apply(tag);
      // A refused write still leaves the switch applied for this session.
      deps.storage.set(storageKey, tag);
    },
    rialtoMessages(tag) {
      return rialtoCache.get(tag) ?? rialtoEnUS;
    },
  };
}

/** The dashboard's runtime. The booking widget clones its own (independent locale). */
export const localeRuntime = createLocaleRuntime();

/**
 * Hands Rialto the messages for the active i18next language. Re-renders on
 * `languageChanged` via `useTranslation`; messages are derived during render
 * from the runtime's cache, which `apply` fills before switching.
 */
export function LocaleBridge({
  runtime = localeRuntime,
  children,
}: {
  runtime?: LocaleRuntime;
  children: ReactNode;
}) {
  const { i18n: active } = useTranslation();
  const tag = active.language as LocaleTag;
  return (
    <RialtoLocaleProvider locale={tag} messages={runtime.rialtoMessages(tag)}>
      {children}
    </RialtoLocaleProvider>
  );
}
