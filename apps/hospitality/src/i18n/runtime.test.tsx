import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { useRialtoLocale } from "@mattbutlerengineering/rialto/providers";
import type { RialtoMessages } from "@mattbutlerengineering/rialto/providers";
import { createLocaleRuntime, LocaleBridge, browserStorage, type RuntimeDeps } from "./runtime.js";
import type { LocaleTag } from "./locales.js";

import { esMX } from "@mattbutlerengineering/rialto/locales/es-MX";

const rialtoES: RialtoMessages = { ...esMX };

function fakeDeps(overrides: Partial<RuntimeDeps> = {}) {
  const store = new Map<string, string>();
  let lang = "";
  const deps: RuntimeDeps = {
    loadAppCatalog: vi.fn(async (tag: LocaleTag) =>
      tag === "es-MX" ? { shell: { skipToMain: "Saltar al contenido principal" } } : {}
    ),
    loadRialtoMessages: vi.fn(async () => rialtoES),
    storage: {
      get: (key) => store.get(key) ?? null,
      set: (key, value) => {
        store.set(key, value);
        return true;
      },
    },
    browserLanguages: () => [],
    setDocumentLang: (tag) => {
      lang = tag;
    },
    timeoutMs: 50,
    ...overrides,
  };
  return { deps, store, lang: () => lang };
}

function SkipLink() {
  const { t } = useTranslation();
  return <span>{t("shell.skipToMain")}</span>;
}

function DismissLabel() {
  return <span>{useRialtoLocale().messages.dismiss}</span>;
}

function renderWith(runtime: ReturnType<typeof createLocaleRuntime>) {
  return render(
    <I18nextProvider i18n={runtime.i18n}>
      <LocaleBridge runtime={runtime}>
        <SkipLink />
        <DismissLabel />
      </LocaleBridge>
    </I18nextProvider>
  );
}

describe("locale runtime", () => {
  it("starts in en-US with the bundled catalog", () => {
    const runtime = createLocaleRuntime(fakeDeps().deps);
    renderWith(runtime);
    expect(screen.getByText("Skip to main content")).toBeInTheDocument();
    expect(screen.getByText("Dismiss")).toBeInTheDocument();
  });

  it("boots into the locale resolveLocale picks from the browser, without persisting it", async () => {
    const { deps, store, lang } = fakeDeps({ browserLanguages: () => ["es-AR"] });
    const runtime = createLocaleRuntime(deps);
    await runtime.bootLocale();
    renderWith(runtime);
    expect(screen.getByText("Saltar al contenido principal")).toBeInTheDocument();
    expect(lang()).toBe("es-MX");
    expect(store.size).toBe(0);
  });

  it("boots into a stored choice over the browser", async () => {
    const { deps, store } = fakeDeps({ browserLanguages: () => ["fr-FR"] });
    store.set("mbe-hospitality-locale", "es-MX");
    const runtime = createLocaleRuntime(deps);
    await runtime.bootLocale();
    expect(runtime.i18n.language).toBe("es-MX");
  });

  it("changeLocale switches app text and rialto messages, persists, and sets lang", async () => {
    const { deps, store, lang } = fakeDeps();
    const runtime = createLocaleRuntime(deps);
    renderWith(runtime);
    await act(() => runtime.changeLocale("es-MX"));
    expect(screen.getByText("Saltar al contenido principal")).toBeInTheDocument();
    expect(screen.getByText("Descartar")).toBeInTheDocument();
    expect(store.get("mbe-hospitality-locale")).toBe("es-MX");
    expect(lang()).toBe("es-MX");
  });

  it("loads a locale's catalogs once", async () => {
    const { deps } = fakeDeps();
    const runtime = createLocaleRuntime(deps);
    await runtime.changeLocale("es-MX");
    await runtime.changeLocale("en-US");
    await runtime.changeLocale("es-MX");
    expect(deps.loadAppCatalog).toHaveBeenCalledTimes(1);
  });

  it("a failed load rejects and leaves language, storage and lang unchanged", async () => {
    const { deps, store, lang } = fakeDeps({
      loadAppCatalog: vi.fn(async () => {
        throw new Error("chunk 404");
      }),
    });
    const runtime = createLocaleRuntime(deps);
    await expect(runtime.changeLocale("fr-CA")).rejects.toThrow("chunk 404");
    expect(runtime.i18n.language).toBe("en-US");
    expect(store.size).toBe(0);
    expect(lang()).toBe("");
  });

  it("a load slower than the timeout rejects and changes nothing", async () => {
    const { deps, store } = fakeDeps({
      loadRialtoMessages: () => new Promise<RialtoMessages>(() => {}),
    });
    const runtime = createLocaleRuntime(deps);
    await expect(runtime.changeLocale("fr-CA")).rejects.toThrow(/timed out/);
    expect(runtime.i18n.language).toBe("en-US");
    expect(store.size).toBe(0);
  });

  it("a failed boot load stays in en-US instead of throwing", async () => {
    const { deps, lang } = fakeDeps({
      browserLanguages: () => ["fr-CA"],
      loadAppCatalog: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const runtime = createLocaleRuntime(deps);
    await expect(runtime.bootLocale()).resolves.toBeUndefined();
    expect(runtime.i18n.language).toBe("en-US");
    expect(lang()).toBe("en-US");
  });

  it("renders en-US text for a key the active catalog lacks, never the raw key", async () => {
    const { deps } = fakeDeps({ loadAppCatalog: vi.fn(async () => ({})) });
    const runtime = createLocaleRuntime(deps);
    await runtime.changeLocale("fr-CA");
    renderWith(runtime);
    expect(screen.getByText("Skip to main content")).toBeInTheDocument();
  });

  it("still switches when the preference cannot be persisted", async () => {
    const { deps } = fakeDeps({ storage: { get: () => null, set: () => false } });
    const runtime = createLocaleRuntime(deps);
    await runtime.changeLocale("es-MX");
    expect(runtime.i18n.language).toBe("es-MX");
  });
});

describe("browserStorage", () => {
  it("reports a blocked or full localStorage instead of throwing", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(browserStorage.set("k", "v")).toBe(false);
    setItem.mockRestore();
  });

  it("reports a successful write", () => {
    expect(browserStorage.set("mbe-test-key", "es-MX")).toBe(true);
    expect(browserStorage.get("mbe-test-key")).toBe("es-MX");
    localStorage.removeItem("mbe-test-key");
  });

  it("reads null when localStorage is unavailable", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(browserStorage.get("k")).toBeNull();
    getItem.mockRestore();
  });
});
