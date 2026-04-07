#!/usr/bin/env node

/**
 * Orphaned Resource Audit
 *
 * Compares live cloud resources (CF Workers, DO Apps, CF DNS) against
 * code-managed definitions (wrangler.toml, Pulumi index.ts, Pulumi config).
 * Flags anything not tracked by IaC and outputs a GitHub-issue-ready report.
 *
 * Required env vars:
 *   CLOUDFLARE_API_TOKEN   — CF API token with Worker + DNS read access
 *   CLOUDFLARE_ACCOUNT_ID  — CF account ID
 *   CLOUDFLARE_ZONE_ID     — CF zone ID for the primary domain
 *   DIGITALOCEAN_TOKEN     — DO API token
 *
 * Optional:
 *   DRY_RUN=1              — print report to stdout instead of creating an issue
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Helpers ─────────────────────────────────────────────────────────

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function cfApi(path) {
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`CF API ${path} failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (!json.success) {
    throw new Error(`CF API ${path} error: ${JSON.stringify(json.errors)}`);
  }
  return json.result;
}

async function doApi(path) {
  const token = requireEnv("DIGITALOCEAN_TOKEN");
  const res = await fetch(`https://api.digitalocean.com/v2${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`DO API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function loadAllowlist() {
  const allowlistPath = resolve(ROOT, "infrastructure/resource-allowlist.json");
  try {
    return JSON.parse(readFileSync(allowlistPath, "utf-8"));
  } catch {
    return { workers: [], digitalocean_apps: [], dns_records: [] };
  }
}

// ── Known Resources from Code ───────────────────────────────────────

function getKnownWorkers() {
  // Workers defined in wrangler.toml files across the repo
  const wranglerPaths = [
    "infrastructure/worker/wrangler.toml",
    "apps/gen/wrangler.toml",
    "apps/hospitality/wrangler.toml",
    "apps/marketing/wrangler.toml",
    "apps/rialto-web/wrangler.toml",
  ];

  const names = new Set();

  for (const rel of wranglerPaths) {
    try {
      const content = readFileSync(resolve(ROOT, rel), "utf-8");
      const match = content.match(/^name\s*=\s*"([^"]+)"/m);
      if (match) {
        names.add(match[1]);
      }
    } catch {
      // File may not exist — skip
    }
  }

  // Workers created by Pulumi (from index.ts resource names)
  // These are the scriptName values in WorkersScript resources
  const pulumiIndex = readFileSync(
    resolve(ROOT, "infrastructure/pulumi/index.ts"),
    "utf-8",
  );
  const scriptNameMatches = pulumiIndex.matchAll(/scriptName:\s*"([^"]+)"/g);
  for (const m of scriptNameMatches) {
    names.add(m[1]);
  }

  return names;
}

function getKnownDoApps() {
  // DO apps defined in Pulumi index.ts
  const pulumiIndex = readFileSync(
    resolve(ROOT, "infrastructure/pulumi/index.ts"),
    "utf-8",
  );

  const names = new Set();
  // Match spec.name values in DO App resources
  const specNameMatches = pulumiIndex.matchAll(
    /new\s+digitalocean\.App\([^)]+,\s*\{[\s\S]*?spec:\s*\{[\s\S]*?name:\s*"([^"]+)"/g,
  );
  for (const m of specNameMatches) {
    names.add(m[1]);
  }

  return names;
}

function getKnownDnsRecords() {
  // DNS records defined in Pulumi index.ts
  const pulumiIndex = readFileSync(
    resolve(ROOT, "infrastructure/pulumi/index.ts"),
    "utf-8",
  );

  const records = [];
  // Match DnsRecord definitions — extract name and type
  const dnsMatches = pulumiIndex.matchAll(
    /new\s+cloudflare\.DnsRecord\(\s*"[^"]+"\s*,\s*\{[^}]*name:\s*"([^"]+)"[^}]*type:\s*"([^"]+)"/gs,
  );
  for (const m of dnsMatches) {
    records.push({ name: m[1], type: m[2] });
  }

  return records;
}

// ── Live Resource Fetchers ──────────────────────────────────────────

async function getLiveWorkers() {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const result = await cfApi(`/accounts/${accountId}/workers/scripts`);
  return result.map((w) => w.id);
}

async function getLiveDoApps() {
  const data = await doApi("/apps");
  return (data.apps || []).map((app) => ({
    id: app.id,
    name: app.spec?.name || app.id,
  }));
}

async function getLiveDnsRecords() {
  const zoneId = requireEnv("CLOUDFLARE_ZONE_ID");
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const records = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const raw = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?page=${page}&per_page=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!raw.ok) {
      throw new Error(`CF DNS list failed: ${raw.status} ${await raw.text()}`);
    }
    const json = await raw.json();
    if (!json.success) {
      throw new Error(`CF DNS list error: ${JSON.stringify(json.errors)}`);
    }
    const pageRecords = json.result || [];
    records.push(
      ...pageRecords.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        content: r.content,
      })),
    );
    totalPages = json.result_info?.total_pages || 1;
    page += 1;
  }

  return records;
}

// ── Comparison Logic ────────────────────────────────────────────────

function isAllowlisted(resource, category, allowlist) {
  const list = allowlist[category] || [];
  return list.some((entry) => {
    if (typeof entry === "string") return entry === resource.name;
    // Object form — match on name (and optionally type for DNS)
    if (entry.name !== resource.name) return false;
    if (entry.type && resource.type && entry.type !== resource.type) return false;
    return true;
  });
}

function findOrphanedWorkers(liveWorkers, knownWorkers, allowlist) {
  return liveWorkers
    .filter((name) => !knownWorkers.has(name))
    .filter((name) => !isAllowlisted({ name }, "workers", allowlist));
}

function findOrphanedDoApps(liveApps, knownApps, allowlist) {
  return liveApps
    .filter((app) => !knownApps.has(app.name))
    .filter((app) => !isAllowlisted(app, "digitalocean_apps", allowlist));
}

function findOrphanedDnsRecords(liveRecords, knownRecords, allowlist, domain) {
  return liveRecords
    .filter((live) => {
      // Normalize: Pulumi uses "@" for root, CF API uses the full domain name
      const liveName = live.name === domain ? "@" : live.name.replace(`.${domain}`, "");
      return !knownRecords.some(
        (known) => known.name === liveName && known.type === live.type,
      );
    })
    .filter((r) => {
      const normalized = r.name === domain ? "@" : r.name.replace(`.${domain}`, "");
      return !isAllowlisted({ name: normalized, type: r.type }, "dns_records", allowlist);
    });
}

// ── Report Generation ───────────────────────────────────────────────

function buildReport(orphanedWorkers, orphanedApps, orphanedDns) {
  const totalOrphaned =
    orphanedWorkers.length + orphanedApps.length + orphanedDns.length;

  if (totalOrphaned === 0) {
    return null;
  }

  const sections = [];

  if (orphanedWorkers.length > 0) {
    const lines = orphanedWorkers.map(
      (name) => `- \`${name}\` — delete with: \`wrangler delete --name ${name}\``,
    );
    sections.push(
      `### Cloudflare Workers (${orphanedWorkers.length})\n\n${lines.join("\n")}`,
    );
  }

  if (orphanedApps.length > 0) {
    const lines = orphanedApps.map(
      (app) =>
        `- \`${app.name}\` (id: \`${app.id}\`) — delete with: \`doctl apps delete ${app.id}\``,
    );
    sections.push(
      `### DigitalOcean Apps (${orphanedApps.length})\n\n${lines.join("\n")}`,
    );
  }

  if (orphanedDns.length > 0) {
    const lines = orphanedDns.map(
      (r) =>
        `- \`${r.type}\` \`${r.name}\` → \`${r.content}\` (id: \`${r.id}\`)`,
    );
    sections.push(
      `### Cloudflare DNS Records (${orphanedDns.length})\n\n${lines.join("\n")}`,
    );
  }

  const body = [
    "## Orphaned Resource Audit",
    "",
    `Found **${totalOrphaned}** resource(s) not managed by code.`,
    "",
    "These resources exist in the cloud but are not tracked by any wrangler.toml,",
    "Pulumi config, or the resource allowlist (`infrastructure/resource-allowlist.json`).",
    "",
    "**Action required:** Delete orphaned resources or add them to the allowlist.",
    "",
    ...sections,
    "",
    "---",
    "_Generated by `scripts/resource-audit.mjs` via GitHub Actions._",
  ].join("\n");

  return { title: `Orphaned resources found (${totalOrphaned})`, body };
}

// ── Issue Creation ──────────────────────────────────────────────────

function createGitHubIssue(title, body) {
  try {
    execFileSync("gh", ["issue", "create", "--title", title, "--label", "audit", "--body", body], {
      cwd: ROOT,
      stdio: "pipe",
    });
    console.log(`Created issue: ${title}`);
  } catch (err) {
    console.error("Failed to create GitHub issue:", err.message);
    // Fall back to printing the report
    console.log("\n--- REPORT ---\n");
    console.log(`# ${title}\n\n${body}`);
    process.exit(1);
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const isDryRun = process.env.DRY_RUN === "1";
  const domain = "mattbutlerengineering.com";
  const allowlist = loadAllowlist();

  console.log("Loading known resources from code...");
  const knownWorkers = getKnownWorkers();
  const knownDoApps = getKnownDoApps();
  const knownDnsRecords = getKnownDnsRecords();

  console.log(`  Workers: ${[...knownWorkers].join(", ")}`);
  console.log(`  DO Apps: ${[...knownDoApps].join(", ")}`);
  console.log(`  DNS Records: ${knownDnsRecords.map((r) => `${r.type} ${r.name}`).join(", ")}`);

  console.log("\nFetching live resources...");
  const [liveWorkers, liveDoApps, liveDnsRecords] = await Promise.all([
    getLiveWorkers(),
    getLiveDoApps(),
    getLiveDnsRecords(),
  ]);

  console.log(`  Live Workers: ${liveWorkers.join(", ")}`);
  console.log(`  Live DO Apps: ${liveDoApps.map((a) => a.name).join(", ")}`);
  console.log(`  Live DNS Records: ${liveDnsRecords.length} total`);

  console.log("\nComparing...");
  const orphanedWorkers = findOrphanedWorkers(liveWorkers, knownWorkers, allowlist);
  const orphanedApps = findOrphanedDoApps(liveDoApps, knownDoApps, allowlist);
  const orphanedDns = findOrphanedDnsRecords(liveDnsRecords, knownDnsRecords, allowlist, domain);

  const report = buildReport(orphanedWorkers, orphanedApps, orphanedDns);

  if (!report) {
    console.log("\nNo orphaned resources found. All clean.");
    return;
  }

  console.log(`\nFound orphaned resources:`);
  console.log(`  Workers: ${orphanedWorkers.length}`);
  console.log(`  DO Apps: ${orphanedApps.length}`);
  console.log(`  DNS Records: ${orphanedDns.length}`);

  if (isDryRun) {
    console.log("\n--- DRY RUN (no issue created) ---\n");
    console.log(`# ${report.title}\n\n${report.body}`);
    return;
  }

  createGitHubIssue(report.title, report.body);
}

main().catch((err) => {
  console.error("Resource audit failed:", err.message);
  process.exit(1);
});
