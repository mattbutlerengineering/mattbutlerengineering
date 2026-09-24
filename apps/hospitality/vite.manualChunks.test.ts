import { describe, expect, it } from "vitest";
import { manualChunks } from "./vite.manualChunks";

// Realistic pnpm-resolved module ids: `.pnpm/<pkg>@<version>/node_modules/<pkg>/...`
const reactDomId =
  "/repo/node_modules/.pnpm/react-dom@19.2.0_react@19.2.0/node_modules/react-dom/index.js";
const reactId = "/repo/node_modules/.pnpm/react@19.2.0/node_modules/react/index.js";
const sentryReactId =
  "/repo/node_modules/.pnpm/@sentry+react@9.12.0_react@19.2.0/node_modules/@sentry/react/build/esm/index.js";
const sentryCoreId =
  "/repo/node_modules/.pnpm/@sentry+core@9.12.0/node_modules/@sentry/core/build/esm/index.js";
const jsonRenderReactId =
  "/repo/node_modules/.pnpm/@json-render+react@1.0.0/node_modules/@json-render/react/index.js";
const jsonRenderCoreId =
  "/repo/node_modules/.pnpm/@json-render+core@1.0.0/node_modules/@json-render/core/index.js";

describe("manualChunks", () => {
  it("routes react and react-dom to react-vendor", () => {
    expect(manualChunks(reactId)).toBe("react-vendor");
    expect(manualChunks(reactDomId)).toBe("react-vendor");
  });

  it("does not route @sentry/react into react-vendor", () => {
    expect(manualChunks(sentryReactId)).not.toBe("react-vendor");
  });

  it("routes @sentry/* packages to sentry-vendor", () => {
    expect(manualChunks(sentryReactId)).toBe("sentry-vendor");
    expect(manualChunks(sentryCoreId)).toBe("sentry-vendor");
  });

  it("does not route @json-render/react into react-vendor", () => {
    expect(manualChunks(jsonRenderReactId)).not.toBe("react-vendor");
  });

  it("routes @json-render/* packages to json-render-vendor", () => {
    expect(manualChunks(jsonRenderReactId)).toBe("json-render-vendor");
    expect(manualChunks(jsonRenderCoreId)).toBe("json-render-vendor");
  });
});
