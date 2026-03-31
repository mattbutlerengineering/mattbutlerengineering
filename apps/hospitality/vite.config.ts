import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      injectRegister: "script-defer",
      registerType: "autoUpdate",
      injectRegister: "script-defer",
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
  ],
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
