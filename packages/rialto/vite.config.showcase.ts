import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "src/showcase",
  css: {
    modules: {
      localsConvention: "camelCase",
    },
  },
  server: {
    port: 5174,
  },
});
