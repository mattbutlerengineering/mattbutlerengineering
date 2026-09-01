import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { viteEntryMap } from "./scripts/lib-entrypoints";
import { libExternal } from "./scripts/lib-external";

export default defineConfig({
  plugins: [react(), dts({ tsconfigPath: "./tsconfig.lib.json" })],
  css: {
    modules: {
      localsConvention: "camelCase",
    },
  },
  build: {
    outDir: "dist/lib",
    lib: {
      // Multi-entry library mode: one chunk per top-level component (plus
      // root barrel, motion tokens, providers, hooks). Lets consumers do
      // `import { Button } from "@mattbutlerengineering/rialto/Button"`
      // without pulling the whole library through the barrel.
      entry: viteEntryMap(),
      formats: ["es"],
      cssFileName: "styles",
    },
    rollupOptions: {
      external: libExternal,
      output: {
        // Stable filenames so the package.json exports map can point at
        // them without a content hash. Shared code lands in chunks/ so
        // top-level paths stay clean.
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
