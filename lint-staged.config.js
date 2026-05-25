import fs from "node:fs";
import path from "node:path";

const TOP_DIRS = ["apps", "packages", "services", "tools"];

function groupByPackage(files) {
  const groups = new Map();
  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    const parts = rel.split(path.sep);
    if (parts.length >= 2 && TOP_DIRS.includes(parts[0])) {
      const pkgDir = path.join(parts[0], parts[1]);
      if (!groups.has(pkgDir)) groups.set(pkgDir, []);
      groups.get(pkgDir).push(file);
    }
  }
  return groups;
}

export default {
  "**/*.{ts,tsx}": (files) => {
    const filtered = files.filter((f) => !f.includes("/generated/"));
    const groups = groupByPackage(filtered);
    const commands = [];
    for (const [pkgDir, pkgFiles] of groups) {
      const localConfig = path.resolve(pkgDir, "eslint.config.js");
      const configFlag = fs.existsSync(localConfig) ? `--config "${localConfig}"` : "";
      const escaped = pkgFiles.map((f) => `"${f}"`).join(" ");
      commands.push(`eslint --fix ${configFlag} ${escaped}`);
    }
    return commands;
  },
};
