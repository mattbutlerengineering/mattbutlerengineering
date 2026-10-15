import { describe, it, expect } from "vitest";
import { SUPPORTED_LOCALES, resolveLocale } from "./locales.js";

describe("SUPPORTED_LOCALES", () => {
  it("lists the four Phase 1 locales by their own names", () => {
    expect(SUPPORTED_LOCALES.map((l) => [l.tag, l.endonym])).toEqual([
      ["en-US", "English (US)"],
      ["en-GB", "English (UK)"],
      ["es-MX", "Español (México)"],
      ["fr-CA", "Français (Canada)"],
    ]);
  });

  it("flags only es-MX and fr-CA as machine-translated", () => {
    expect(SUPPORTED_LOCALES.filter((l) => l.machineTranslated).map((l) => l.tag)).toEqual([
      "es-MX",
      "fr-CA",
    ]);
  });
});

describe("resolveLocale", () => {
  it("uses a valid stored choice over the browser", () => {
    expect(resolveLocale({ stored: "fr-CA", browser: ["es-MX"] })).toBe("fr-CA");
  });

  it("ignores an invalid stored value", () => {
    expect(resolveLocale({ stored: "klingon", browser: ["es-MX"] })).toBe("es-MX");
    expect(resolveLocale({ stored: "de-DE", browser: ["en-GB"] })).toBe("en-GB");
  });

  it("matches a browser tag exactly, case-insensitively", () => {
    expect(resolveLocale({ stored: null, browser: ["en-gb"] })).toBe("en-GB");
  });

  it("falls back to the supported locale for the same language", () => {
    expect(resolveLocale({ stored: null, browser: ["es-AR"] })).toBe("es-MX");
    expect(resolveLocale({ stored: null, browser: ["es"] })).toBe("es-MX");
    expect(resolveLocale({ stored: null, browser: ["fr-FR"] })).toBe("fr-CA");
  });

  it("sends English other than en-GB to en-US", () => {
    expect(resolveLocale({ stored: null, browser: ["en-AU"] })).toBe("en-US");
    expect(resolveLocale({ stored: null, browser: ["en"] })).toBe("en-US");
  });

  it("honours the browser's preference order", () => {
    expect(resolveLocale({ stored: null, browser: ["fr-FR", "es-MX"] })).toBe("fr-CA");
  });

  it("skips unsupported languages and unparseable tags", () => {
    expect(resolveLocale({ stored: null, browser: ["de-DE", "!!", "es-ES"] })).toBe("es-MX");
  });

  it("defaults to en-US with nothing to go on", () => {
    expect(resolveLocale({ stored: null, browser: [] })).toBe("en-US");
    expect(resolveLocale({ stored: null, browser: ["ja-JP"] })).toBe("en-US");
  });
});
