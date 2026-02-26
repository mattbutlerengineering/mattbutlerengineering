import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import path from "path";

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
      entry: {
        rialto: path.resolve(__dirname, "src/lib-entry.ts"),
        motion: path.resolve(__dirname, "src/tokens/motion.ts"),
      },
      formats: ["es"],
      cssFileName: "styles",
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "framer-motion", "lucide-react"],
    },
  },
});
