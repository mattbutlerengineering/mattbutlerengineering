/**
 * Product improvement discoverer for the learning loop.
 *
 * Runs as the last phase of the learning loop — only when the regression
 * queue is empty. Proactively finds ways to improve the product using a
 * weekly strategy rotation.
 *
 * Usage:
 *   node scripts/improvement-discoverer.mjs              # discover improvements
 *   node scripts/improvement-discoverer.mjs --dry-run    # show what would be filed
 *   node scripts/improvement-discoverer.mjs --week N     # force week number
 */

const MAX_ISSUES = 2;

const STRATEGIES = ["perf", "a11y", "design", "test-gaps"];

const HARDCODED_HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const HARDCODED_PX_RE = /\b\d+px\b/;

export function getWeeklyStrategy(weekNumber) {
  return STRATEGIES[weekNumber % 4];
}

export function shouldRunDiscovery(queue) {
  return queue.regressions === 0 && queue.acmmGaps === 0 && queue.securityIssues === 0;
}

export function findPerfImprovements(inventory) {
  return inventory
    .filter((page) => page.scores?.performance != null && page.scores.performance < 0.9)
    .map((page) => ({
      url: page.url,
      score: page.scores.performance,
      title: `perf: ${page.url} page score ${Math.round(page.scores.performance * 100)}`,
      metric: "Lighthouse performance",
      evidence: `Score: ${Math.round(page.scores.performance * 100)}/100 (target: 90+)`,
    }))
    .sort((a, b) => a.score - b.score);
}

export function findA11yImprovements(inventory) {
  return inventory
    .filter((page) => page.scores?.accessibility != null && page.scores.accessibility < 0.95)
    .map((page) => ({
      url: page.url,
      score: page.scores.accessibility,
      title: `a11y: ${page.url} page score ${Math.round(page.scores.accessibility * 100)}`,
      metric: "Lighthouse accessibility",
      evidence: `Score: ${Math.round(page.scores.accessibility * 100)}/100 (target: 95+)`,
    }))
    .sort((a, b) => a.score - b.score);
}

export function findDesignInconsistencies(files) {
  const results = [];
  for (const file of files) {
    const issues = [];
    if (HARDCODED_HEX_RE.test(file.content)) {
      issues.push("hardcoded hex color");
    }
    if (HARDCODED_PX_RE.test(file.content)) {
      issues.push("hardcoded px value");
    }
    if (issues.length > 0) {
      results.push({
        path: file.path,
        issues,
        title: `design: ${file.path} uses ${issues.join(", ")}`,
        score: 0,
        evidence: `Found: ${issues.join(", ")} — should use rialto design tokens`,
      });
    }
  }
  return results;
}

export function findTestGaps(surfaces, testFiles) {
  const testFileStr = testFiles.join(" ").toLowerCase();
  return surfaces.filter((surface) => {
    const slug = surface.replace(/^\//, "").replace(/\//g, "-") || "home";
    return !testFileStr.includes(slug);
  });
}

export function deduplicateAgainstOpen(improvements, openIssues) {
  return improvements.filter((imp) => {
    const impUrl = (imp.url ?? imp.path ?? "").toLowerCase();
    return !openIssues.some((issue) => {
      const title = (issue.title ?? "").toLowerCase();
      return impUrl && title.includes(impUrl);
    });
  });
}

export function rankAndCap(items) {
  const sorted = [...items].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  return sorted.slice(0, MAX_ISSUES);
}
