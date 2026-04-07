import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            // React core — stable, cached long-term
            if (id.includes("/react-dom/") || id.includes("/react/")) {
              return "react-vendor";
            }
            // Routing — separate from page code
            if (id.includes("/react-router")) {
              return "router-vendor";
            }
            // JSON Render — heavy rendering library
            if (id.includes("/@json-render/")) {
              return "json-render-vendor";
            }
          }
          // Rialto design system — large shared UI, loaded once
          if (id.includes("/packages/rialto/")) {
            return "rialto-vendor";
          }
          // Auth package — shared auth layer
          if (id.includes("/packages/auth/")) {
            return "auth-vendor";
          }
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  base: "/gen/",
  server: {
    port: 3005,
    proxy: {
      "/api": {
        target: "http://localhost:3003",
        changeOrigin: true,
      },
    },
  },
});
