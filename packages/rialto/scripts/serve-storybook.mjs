#!/usr/bin/env node
/**
 * Minimal static file server for serving storybook-static/ in visual regression tests.
 * Used as the webServer command in playwright.visual.config.ts.
 *
 * Usage: node scripts/serve-storybook.mjs [port]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(__dirname, "..", "storybook-static");
const PORT = parseInt(process.argv[2] ?? "6007", 10);

const MIME_TYPES = {
  html: "text/html",
  js: "application/javascript",
  mjs: "application/javascript",
  css: "text/css",
  json: "application/json",
  png: "image/png",
  svg: "image/svg+xml",
  woff2: "font/woff2",
  woff: "font/woff",
  ico: "image/x-icon",
  txt: "text/plain",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const urlPath = req.url?.split("?")[0] ?? "/";
  const filePath = path.join(STATIC_DIR, urlPath === "/" ? "index.html" : urlPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: serve index.html for extensionless paths
      if (!path.extname(urlPath)) {
        fs.readFile(path.join(STATIC_DIR, "index.html"), (e2, fallback) => {
          if (e2) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not found");
          } else {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(fallback);
          }
        });
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
    } else {
      res.writeHead(200, { "Content-Type": getMimeType(filePath) });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Storybook static server running at http://localhost:${PORT}`);
});
