import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";
import { workboxPrecacheGlobPatterns, workboxRuntimeCaching } from "./pwa/workbox-options.js";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      injectRegister: "script-defer",
      registerType: "autoUpdate",
      scope: "/",
      includeAssets: ["favicon.svg", "favicon.ico", "apple-touch-icon.png", "robots.txt"],
      manifest: {
        name: "Matt Butler Engineering",
        short_name: "MBE",
        description: "Software engineering solutions for hospitality and beyond",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
          },
          {
            src: "pwa-512x512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
          },
          {
            src: "pwa-512x512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Precache assets only — NOT html. JS/CSS have content hashes so
        // stale cache is harmless; HTML must always come from the network
        // to avoid serving old bundles after a deploy.
        globPatterns: [...workboxPrecacheGlobPatterns],
        navigateFallback: null,
        // workbox writes sw.js after sentryVitePlugin has uploaded and deleted
        // the bundle's maps, so its map would ship and fail
        // scripts/verify-sentry-sourcemaps.mjs in deploy-static.yml.
        sourcemap: false,
        // Intentionally no Google Fonts routes: a worker fetch() of those
        // hosts is blocked by connect-src. See pwa/workbox-options.ts.
        runtimeCaching: [...workboxRuntimeCaching],
      },
    }),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
      // Without this the plugin only logs a failed upload and the build passes,
      // shipping unsymbolicated bundles silently. Only runs when enabled (token set).
      errorHandler: (err) => {
        throw err;
      },
    }),
  ],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/react-router/")
          ) {
            return "vendor-react";
          }
          if (id.includes("/node_modules/framer-motion/")) {
            return "vendor-motion";
          }
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@gen": resolve(__dirname, "../gen/src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            if (req.headers["authorization"]) {
              proxyReq.setHeader("Authorization", req.headers["authorization"]);
            }
          });
        },
      },
    },
  },
});
