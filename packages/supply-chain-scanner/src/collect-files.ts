import { closeSync, openSync, readdirSync, readSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { SourceFile } from "./types.js";

/** Directories never worth scanning (and a DoS risk if huge). */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".turbo", ".next"]);

/** Only inspect plausibly-text files. Anything else is ignored, never executed. */
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".json",
  ".md",
  ".mdx",
  ".txt",
  ".sh",
  ".bash",
  ".zsh",
  ".py",
  ".yml",
  ".yaml",
  ".toml",
]);

/** Skip files larger than this to bound work and avoid pulling in blobs. */
const MAX_FILE_BYTES = 512 * 1024;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/** Extension-less files (bin/ scripts) are only scanned when they start with a shebang. */
function hasShebang(path: string): boolean {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(2);
    return readSync(fd, buf, 0, 2, 0) === 2 && buf.toString("latin1") === "#!";
  } finally {
    closeSync(fd);
  }
}

function isScannable(name: string, full: string): boolean {
  const ext = extensionOf(name);
  return ext === "" ? hasShebang(full) : TEXT_EXTENSIONS.has(ext);
}

/**
 * Recursively read the text files of a package directory.
 *
 * Pure read-only traversal: it calls `readFileSync` (text) and never resolves,
 * imports, or executes any file. Returns a new array; mutates nothing.
 */
export function collectFiles(rootDir: string): SourceFile[] {
  const out: SourceFile[] = [];

  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (!entry.isFile()) continue; // ignore symlinks/sockets — never follow them
      if (!isScannable(entry.name, full)) continue;
      if (statSync(full).size > MAX_FILE_BYTES) continue;
      const relPath = relative(rootDir, full).split(sep).join("/");
      out.push({ relPath, content: readFileSync(full, "utf8") });
    }
  };

  walk(rootDir);
  return out;
}
