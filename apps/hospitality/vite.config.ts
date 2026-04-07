import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      injectRegister: "script-defer",
      registerType: "autoUpdate",
      scope: "/hospitality/",
      includeAssets: ["favicon.svg", "robots.txt"],
      manifest: {
        name: "MBE Hospitality",
        short_name: "Hospitality",
        description: "Hospitality management — reservations, guests, and floor plans",
        theme_color: "#2563eb",
        background_color: "#f9fafb",
        display: "standalone",
        scope: "/hospitality/",
        start_url: "/hospitality/",
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
        globPatterns: ["**/*.{js,css,ico,png,svg,woff,woff2}"],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
    }),
  ],
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
            // Canvas library for floor plan editor (heavy, only needed on one page)
            if (id.includes("/konva/") || id.includes("/react-konva/")) {
              return "canvas-vendor";
            }
            // JSON Render — used for spec rendering
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
          // Sentry — error reporting
          if (id.includes("/packages/sentry/") || id.includes("/@sentry/")) {
            return "sentry-vendor";
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
  base: "/hospitality/",
  server: {
    port: 3002,
    proxy: {
      "/api/v1/users": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/api/gen": {
        target: "http://localhost:3003",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3004",
        changeOrigin: true,
      },
    },
  },
});
