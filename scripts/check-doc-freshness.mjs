import fs from "node:fs";
import path from "node:path";

const DOC_FILES = ["README.md", "CLAUDE.md"];

const EXCLUDE_DIRS = ["node_modules", ".git", ".agent-worktrees", ".claude", "dist"];

export function findDocFiles(root) {
  const results = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.includes(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (DOC_FILES.includes(entry.name)) {
        results.push(path.join(dir, entry.name));
      }
    }
  }

  walk(root);
  return results;
}

function isPathLikeName(name) {
  if (/\.\w+$/.test(name)) return true;
  if (/^[a-zA-Z0-9_-]+$/.test(name)) return true;
  return false;
}

export function extractPathReferences(content, filePath) {
  const refs = [];
  const lines = content.split("\n");
  const fileDir = path.dirname(filePath);

  let inFencedBlock = false;
  let fenceLang = null;
  let fenceHasTreeChars = false;
  let treeRootDir = null;
  let treePathStack = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trimStart().startsWith("```")) {
      if (!inFencedBlock) {
        inFencedBlock = true;
        const langMatch = line.trimStart().match(/^```(\w+)/);
        fenceLang = langMatch ? langMatch[1] : null;
        fenceHasTreeChars = false;
        treeRootDir = null;
        treePathStack = [];
      } else {
        inFencedBlock = false;
        fenceLang = null;
        fenceHasTreeChars = false;
        treeRootDir = null;
        treePathStack = [];
      }
      continue;
    }

    if (inFencedBlock) {
      if (fenceLang) continue;

      const newRootMatch = line.match(/^(\S+?)\/\s*$/);
      if (newRootMatch) {
        const candidate = newRootMatch[1];
        const candidatePath = path.resolve(fileDir, candidate);
        if (fs.existsSync(candidatePath)) {
          treeRootDir = candidate;
        } else if (candidate.includes("/")) {
          treeRootDir = "SKIP";
        } else {
          treeRootDir = "";
        }
        treePathStack = [];
        continue;
      }

      const treeEntry = line.match(/^([│ ]*)[├└]── (.+?)\/?(\s+#.*)?$/);
      if (treeEntry) {
        const name = treeEntry[2].trim();
        if (!isPathLikeName(name)) continue;

        fenceHasTreeChars = true;
        const indent = treeEntry[1].replace(/[│]/g, " ").length;
        const depth = Math.floor(indent / 4) + 1;

        if (treeRootDir === null) treeRootDir = "";

        if (treeRootDir === "SKIP") continue;

        while (treePathStack.length >= depth) treePathStack.pop();
        treePathStack.push(name);

        const segments = treeRootDir ? [treeRootDir, ...treePathStack] : [...treePathStack];
        const refPath = segments.join("/");
        const resolved = path.resolve(fileDir, refPath);
        refs.push({
          file: filePath,
          referencedPath: refPath,
          resolvedPath: resolved,
          line: i + 1,
          type: "tree-entry",
        });
      }
      continue;
    }

    const linkPattern = /\[.*?\]\(([^)]+)\)/g;
    let match;

    while ((match = linkPattern.exec(line)) !== null) {
      const link = match[1].split("#")[0].trim();
      if (!link) continue;
      if (link.startsWith("http") || link.startsWith("mailto:")) continue;

      const resolved = path.resolve(fileDir, link);
      refs.push({
        file: filePath,
        referencedPath: path.relative(path.dirname(filePath), resolved),
        resolvedPath: resolved,
        line: i + 1,
        type: "markdown-link",
      });
    }
  }

  return refs;
}

export function checkFreshness(root) {
  const docFiles = findDocFiles(root);
  const stale = [];

  for (const docFile of docFiles) {
    const content = fs.readFileSync(docFile, "utf-8");
    const refs = extractPathReferences(content, docFile);

    for (const ref of refs) {
      if (!fs.existsSync(ref.resolvedPath)) {
        stale.push(ref);
      }
    }
  }

  return { stale };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  const root = process.argv[2] || process.cwd();
  console.log("Checking doc freshness...");
  const { stale } = checkFreshness(root);

  for (const ref of stale) {
    console.error(
      `[STALE] ${path.relative(root, ref.file)}:${ref.line}: ${ref.referencedPath} does not exist`
    );
  }

  if (stale.length > 0) {
    console.error(`\nFound ${stale.length} stale reference(s).`);
    process.exit(1);
  }

  console.log("No stale references found.");
}
