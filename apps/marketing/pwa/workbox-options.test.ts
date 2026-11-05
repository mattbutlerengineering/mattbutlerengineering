import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isDocumentFontRequest,
  routeListClaims,
  serviceWorkerClaimsUrl,
  workboxPrecacheGlobPatterns,
  workboxRuntimeCaching,
  type ServiceWorkerRuntimeRoute,
} from "./workbox-options.js";

const FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400&family=DM+Mono:wght@300;400&display=swap";
const FONT_FILE = "https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZ2IHSeH.woff2";

const fontStylesheetRoute: ServiceWorkerRuntimeRoute = {
  urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
  handler: "CacheFirst",
};

describe("marketing service worker routes", () => {
  it("does not fetch Google Fonts from the worker", () => {
    expect(isDocumentFontRequest(FONT_STYLESHEET)).toBe(true);
    expect(isDocumentFontRequest(FONT_FILE)).toBe(true);
    expect(serviceWorkerClaimsUrl(FONT_STYLESHEET)).toBe(false);
    expect(serviceWorkerClaimsUrl(FONT_FILE)).toBe(false);
    expect(isDocumentFontRequest("https://mattbutlerengineering.com/assets/app.js")).toBe(false);
    expect(isDocumentFontRequest("not a url")).toBe(false);
  });

  it("would report a font route if one were registered", () => {
    expect(routeListClaims([fontStylesheetRoute], FONT_STYLESHEET)).toBe(true);
    expect(routeListClaims([fontStylesheetRoute], FONT_FILE)).toBe(false);
    expect(
      routeListClaims([{ urlPattern: "fonts.gstatic.com", handler: "CacheFirst" }], FONT_FILE)
    ).toBe(true);
    expect(routeListClaims(workboxRuntimeCaching, FONT_STYLESHEET)).toBe(false);
  });

  it("precaches same-origin build assets and not HTML", () => {
    const patterns = workboxPrecacheGlobPatterns.join(" ");
    expect(patterns).toContain("js");
    expect(patterns).toContain("css");
    expect(patterns).toContain("woff2");
    expect(workboxPrecacheGlobPatterns.some((pattern) => pattern.includes("html"))).toBe(false);
  });

  it("is what vite.config.ts installs, with no inlined font hosts", () => {
    const configPath = join(dirname(fileURLToPath(import.meta.url)), "../vite.config.ts");
    const config = readFileSync(configPath, "utf8");
    expect(config).toContain("workboxRuntimeCaching");
    expect(config).toContain("workboxPrecacheGlobPatterns");
    expect(config).toContain("navigateFallback: null");
    expect(config).not.toMatch(/fonts\.googleapis\.com/);
    expect(config).not.toMatch(/fonts\.gstatic\.com/);
    expect(config).not.toMatch(/google-fonts-cache/);
    expect(config).not.toMatch(/gstatic-fonts-cache/);
  });
});
