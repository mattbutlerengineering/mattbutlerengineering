import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { resolve } from "path";
import { manualChunks } from "./vite.manualChunks.js";

export default defineConfig({
  plugins: [
    react(),
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
        manualChunks,
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
      "/public": {
        target: "http://localhost:3004",
        changeOrigin: true,
      },
    },
  },
});
